# ADR-0012 — La conversación vive en SQLite, no en el proceso

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [consulta IA](../process/consulta-ia.md), [componentes Flask](../components/flask-app.md), [despliegue](../deployment.md)

## Contexto

El chat vivía en globales de módulo (`app._chat_handler`,
`app._chat_proveedor`) y en la lista `ChatHandler.messages`. La imagen arranca
**dos** workers (`docker/Containerfile`: `gunicorn --workers 2`, sync). Las
consecuencias no eran teóricas:

- Dos peticiones consecutivas caían en workers distintos → el modelo recibía
  **la mitad del historial**, y respondía como si esa fuera toda la
  conversación.
- `POST /api/v1/chat/reset` reiniciaba el objeto de **un** worker; el otro
  conservaba la conversación y su mapa de ofuscación.
- `POST /api/v1/admin/llm` invalidaba el singleton de un worker, así que
  `GET /api/v1/admin/llm` devolvía un `activo` que **alternaba** según a quién
  cayera la lectura.
- `self.messages` no se podaba nunca: el coste por turno crecía hasta que el
  proveedor rechazaba el contexto y el turno moría con un 500.

La auditoría §13 marcaba "12-factor · procesos sin estado" como ✅. Era falso,
y esta decisión también corrige esa celda.

## Decisión

**La única verdad compartida entre workers es SQLite, así que ahí vive la
conversación.**

- El **hilo** se identifica con un id que viaja en la cookie de sesión de
  Flask, **firmada con `SECRET_KEY`**: el cliente no puede fabricarse el hilo
  de otro, y el proceso no tiene que recordarlo.
- El `ChatHandler` se construye **por petición** y reconstruye la historia
  desde `chat_conversations` en cada turno. `self.messages` pasa a ser papel
  de borrador del turno, no estado de la conversación.
- La historia enviada al modelo se acota a `MAX_TURNOS_HISTORIA` (12 turnos).
- `reset` borra el hilo **en la base** (`olvidar_conversacion`), así que
  alcanza a todos los procesos.
- El proveedor activo se **deriva** de la configuración persistida en cada
  lectura. No hay singleton que invalidar: un cambio en admin aplica en todos
  los workers de inmediato.

## Consecuencia sobre los tokens de ofuscación

Un token era `[VIN-001-<uuid4>]`: contador **de proceso** y azar. Un worker no
podía revertir un token que había minteado el otro, y al reconstruir la
historia desde la base (que guarda texto enmascarado, ADR-0011) los tokens
antiguos habrían quedado sin resolver.

El token pasa a ser **determinista**: `sha256(hilo | valor)` truncado. Mismo
hilo y mismo valor ⇒ mismo token, en cualquier proceso y en cualquier orden.
`ObfuscationLayer.precargar` siembra el mapa con los identificadores de la
sesión al reconstruir, para que `unmask_text` siga devolviéndole al operador
el valor real.

## Consecuencias

- Un worker más (o diez) deja de cambiar el comportamiento del chat.
- La conversación sobrevive al reinicio del contenedor. Es una mejora, y
  también una decisión de privacidad: se guarda **enmascarada** (ADR-0011).
- Coste: una lectura de historia por turno (indexada por
  `idx_chat_session`) y construir el manejador por petición. Despreciable
  frente a la latencia del proveedor.
- El contexto enviado deja de crecer sin límite; a cambio, el modelo olvida
  más allá de 12 turnos. Es el intercambio correcto para un chat de consulta.
