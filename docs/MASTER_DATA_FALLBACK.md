# MASTER DATA FALLBACK · GNOSIS:AUTOGENES

Punto de retorno **inmutable** y verificado del sistema. Si un cambio
futuro rompe algo, este es el estado al que SIEMPRE se puede volver: la
ruta crítica F1–F12 completa, 205 pruebas verdes, ruff limpio.

## Qué contiene este punto

- **Sustrato AUTOGENES** (F1–F6): grafo de evidencia con procedencia
  fragmento→página→PDF, saneadores en servidor, bitácora WORM.
- **QUALIA** (F7): topología determinista, anomalías vs base, 7
  instrumentos + Máquina C2.
- **Gnosis AI sobre el grafo** (F8): 7 tools con citas.
- **CONCILIA** (F9): conciliación tri-fuente, cupos what-if, dossier,
  lookup por VIN, lienzo Caudal.
- **VALIDACIÓN** (F10): 16 reglas de glosa, certificado, alertas al Radar.
- **SINAPSIS** (F11): insights por recombinación verificada + lattice de
  refinamiento de particiones + dockeo re-anclador.
- **NOMOS** (F12): reglas como neuronas de umbral, P&L, volante
  insight→regla, backtesting.
- **Endurecimiento**: CI, export JSON, API de bitácora, candado de
  operador opcional, correcciones de la auditoría de bugs.

## Referencia inmutable

- **Tag git:** `master-data-fallback-gnosis-autogenes` (nombre humano:
  MASTER DATA FALLBACK GNOSIS:AUTOGENES).
- **Rama:** `claude/gnosis-autogenes-i-85bwsd`.
- Un tag anotado no se mueve con nuevos commits: apunta para siempre a
  este árbol exacto. Para blindarlo del todo, proteger el tag en
  GitHub (Settings → Tags → New rule → `master-data-fallback-*`).

## Cómo volver a este punto

```bash
# inspeccionar sin tocar la rama
git checkout master-data-fallback-gnosis-autogenes

# restaurar un archivo puntual desde el fallback
git checkout master-data-fallback-gnosis-autogenes -- ruta/al/archivo

# reponer TODA la rama al fallback (destructivo — pide confirmación)
git reset --hard master-data-fallback-gnosis-autogenes
```

## Dominios de salida a permitir (allowlist de red)

El sistema es local-first; estos son los ÚNICOS hosts externos que toca,
y solo cuando una función los necesita. Sin ellos, GNOSIS funciona igual
salvo la función indicada:

| Dominio | Puerto | Para qué | Si se bloquea |
|---|---|---|---|
| `api.deepseek.com` | 443 | LLM por defecto (extracción, narrativa, chat) | Las funciones con modelo degradan; el resto de motores (deterministas) siguen intactos |
| `api.anthropic.com` | 443 | Fallback de Claude (opcional, solo si se activa en admin) | Sin efecto salvo que se use como fallback |
| `cdn.jsdelivr.net` | 443 | Bootstrap 5.3 (CSS/JS del chasis visual) | El layout base pierde estilo; los lienzos deep-tech (canvas propios) NO dependen de esto |
| `cdnjs.cloudflare.com` | 443 | pdf.js (visor de PDF en el navegador) | El visor de PDF del cliente no carga; la extracción en servidor no se afecta |

**Alternativa a allowlistear los dos CDN: vendorizar.** Bootstrap y
pdf.js son **100% open source (licencia MIT), sin costo**. «Vendorizar»
= descargar esos archivos una vez y servirlos desde `static/` en vez del
CDN. Elimina la dependencia de red por completo, a cambio de versionar
~250 KB en el repo. Es una decisión, no un requisito: si se allowlistea
`cdn.jsdelivr.net` y `cdnjs.cloudflare.com`, no hace falta vendorizar.
