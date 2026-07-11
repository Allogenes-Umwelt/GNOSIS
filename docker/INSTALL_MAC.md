# GNOSIS en una Mac — guía paso a paso

Instala y corre GNOSIS en macOS (Apple Silicon M1/M2/M3/M4 o Intel) usando
**Podman**. GNOSIS es un contenedor autocontenido: un servidor Flask con
SQLite local — no necesita backend ni base de datos externa. Tus datos viven
en tu Mac, en volúmenes persistentes.

> Funciona igual con **Docker Desktop**: donde diga `podman`, usa `docker`.
> Podman es gratis y sin licencia para empresas; por eso es el camino
> recomendado.

---

## Antes de empezar

Necesitas dos cosas:

1. **Homebrew** — el gestor de paquetes de Mac. Si no lo tienes, pégalo en la
   Terminal (Aplicaciones → Utilidades → Terminal):

   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. El **ZIP de GNOSIS** que te entregué, descomprimido. Al descomprimirlo
   queda una carpeta `gnosis/`.

---

## Paso 1 · Instalar Podman

En la Terminal:

```bash
brew install podman podman-compose
```

Podman en Mac corre los contenedores dentro de una máquina Linux ligera (los
contenedores son Linux). La creas y la arrancas una sola vez:

```bash
podman machine init
podman machine start
```

> Si ya tenías una máquina de antes, con `podman machine start` basta.
> Para comprobar que quedó viva: `podman info` no debe dar error.

---

## Paso 2 · Entrar a la carpeta del proyecto

Descomprime el ZIP (doble clic o `unzip`), y en la Terminal entra a la
carpeta. Por ejemplo, si lo descomprimiste en Descargas:

```bash
cd ~/Downloads/gnosis
```

Debes ver la carpeta `docker/` adentro:

```bash
ls docker/
# Containerfile  Dockerfile  compose.yaml  install.sh  README.md  INSTALL_MAC.md  .env.example
```

---

## Paso 3 · Configurar tus llaves (`.env`)

GNOSIS lee sus secretos de un archivo `.env` que **tú** creas (nunca viene en
el ZIP). Copia la plantilla:

```bash
cp docker/.env.example .env
```

Ábrelo con TextEdit (`open -e .env`) y llena dos valores:

- **`DEEPSEEK_API_KEY`** — tu llave para el chat Gnosis·IA. Sin ella todo lo
  demás funciona; solo el chat queda inactivo.
- **`FLASK_SECRET_KEY`** — una cadena secreta fuerte para las sesiones.
  Genérala así y pega el resultado:

  ```bash
  python3 -c "import secrets; print(secrets.token_hex(32))"
  ```

Guarda y cierra el archivo.

---

## Paso 4 · Construir y arrancar (un comando)

```bash
./docker/install.sh
```

Esto detecta Podman, construye la imagen (la primera vez baja Python, Java 17
y las dependencias — tarda unos minutos) y levanta el servicio. Cuando
termine verás:

```
GNOSIS está en:  http://127.0.0.1:5001
```

Abre esa dirección en Safari o Chrome. **Ya está corriendo.**

> **Alternativa manual**, si prefieres no usar el script:
> ```bash
> podman compose -f docker/compose.yaml up -d --build
> ```

---

## Uso diario

| Acción | Comando (desde la carpeta `gnosis/`) |
|--------|--------------------------------------|
| Ver que está corriendo | `podman ps` |
| Ver los logs en vivo | `podman compose -f docker/compose.yaml logs -f` |
| Detener | `podman compose -f docker/compose.yaml down` |
| Volver a arrancar | `podman compose -f docker/compose.yaml up -d` |
| Actualizar tras cambios | `podman compose -f docker/compose.yaml up -d --build` |

Si reinicias la Mac, arranca primero la máquina de Podman y luego el
servicio:

```bash
podman machine start
cd ~/Downloads/gnosis
podman compose -f docker/compose.yaml up -d
```

### Que arranque solo (opcional)

Para no teclear nada tras reiniciar:

```bash
podman machine set --rootful=false
podman update --restart=always gnosis
```

La máquina de Podman se puede marcar para autoarranque desde **Podman
Desktop** (app gráfica: `brew install --cask podman-desktop`), que además te
deja iniciar/detener el contenedor con un clic.

---

## Tus datos y cómo respaldarlos

Todo lo que subes y generas persiste en tres volúmenes, que **sobreviven** a
`down`, reinicios y reconstrucciones:

| Volumen | Contenido |
|---------|-----------|
| `gnosis_data` | la base SQLite (`aduanas.db`) |
| `gnosis_uploads` | facturas e insumos que cargas |
| `gnosis_downloads` | Excel / ZIP que descargas |

Respaldo de la base a un archivo:

```bash
podman volume export gnosis_data --output ~/gnosis_backup.tar
```

También puedes exportar el grafo de evidencia completo como JSON desde la app:
`http://127.0.0.1:5001/api/v1/autogenes/exportar`.

---

## Si algo falla

| Síntoma | Arreglo |
|---------|---------|
| `Cannot connect to Podman` | Corre `podman machine start`. |
| `env file .env not found` | Te faltó el Paso 3: `cp docker/.env.example .env`. |
| El chat no responde | `DEEPSEEK_API_KEY` vacía en `.env` — el resto sí funciona. |
| Puerto 5001 ocupado | Cambia el mapeo a `127.0.0.1:5002:5001` en `docker/compose.yaml` y reconstruye. |
| Sesiones se reinician | Define un `FLASK_SECRET_KEY` en `.env`. |
| El build tarda mucho la 1ª vez | Normal: baja Python + Java + dependencias. Las siguientes veces usa caché. |

---

## Por qué es seguro

- Corre como **usuario no-root** dentro del contenedor.
- El puerto está atado a **127.0.0.1** — no se expone a tu red local ni a
  internet; solo tú lo ves desde la Mac.
- Sirve con **gunicorn** (servidor de producción), sin modo debug.
- El `.env` con tus secretos **nunca** entra a la imagen ni al ZIP.
- Los identificadores sensibles (chasis, factura) viajan **ofuscados** al
  modelo de IA; se restauran solo en tu pantalla.
