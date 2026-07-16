# OLA 2 — CONCILIA & VALIDACIÓN: antes / después del backend

Documento de cierre de OLA 2. Registra, cambio por cambio, qué hacía el
backend **original** (antes de esta ola) y qué hace **ahora**, con el impacto
honesto sobre cada cifra citada. También documenta los detectores que la
verificación de datos **descartó o reformó**, con su evidencia.

Rama: `claude/gnosis-autogenes-i-85bwsd-2zxb65` (espejo `…-85bwsd`).
Commits de OLA 2: `4990887` (D1+D3), `9023dd5` (monetización), `f1b5008`
(reglas VALIDACIÓN).

---

## 0. Resumen en una línea

OLA 2 **no cambió la regla de casamiento** ni redefinió los hallazgos
existentes. Agregó 2 detectores a CONCILIA y 6 reglas a VALIDACIÓN, y
endureció la honestidad de la monetización (los ceros fabricados dejan de
contarse como $0 real). De los 8 detectores propuestos, **6 embarcaron, 2
murieron y 2 se reformaron** tras verificar la semántica real del pipeline.

---

## 1. Lo que NO cambió (las garantías)

| Aspecto | Estado |
|---|---|
| **Regla de casamiento DWH↔PDF** (`chasis + factura[:8]`, `_JOIN_PAR`) | Intacta. Sigue compartida con la proyección del grafo. |
| **Los 8 hallazgos originales** (su definición y disparo) | Intactos. Las mismas filas producen los mismos hallazgos. |
| **Flujo tri-fuente** (vendidos / conciliados / llegados / `pct_conciliado`) | Intacto. Deriva del mismo join. |
| **`valor_en_riesgo_mxn`** | **Sin cambio para los mismos datos** — ver §2.3 (el detector que lo habría subido, D2, se descartó). |
| **Partición `veredicto_por_fila`** (en_paz/en_disputa/sin_llegada) | Intacta. Los detectores nuevos son overlay, no una celda nueva. |
| **`cupos_what_if`, `estado_vin`, dossier, certificado** | Intactos. |

---

## 2. CONCILIA — cambios

### 2.1 Nuevo detector · `pedimento_sin_unidades` (D1)

- **Antes:** el pedimento solo participaba como FK nula (`sin_pedimento`
  detecta *vendido sin pedimento*). El caso inverso —un pedimento que
  ninguna fila cita— **no se detectaba**.
- **Después:** nuevo hallazgo `pedimento_sin_unidades` — declaraciones
  aduanales de la sesión que ninguna importación referencia. Severidad
  `warn`. Sin monto (no se adivina). Refs: `numero_pedimento`, `aduana`.
- **Impacto en cifras:** `total` (conteo de fugas) crece cuando aplica.
  Ningún monto se mueve.
- **Consulta:** `NOT EXISTS (SELECT 1 FROM importaciones i WHERE
  i.pedimento_id = p.id)`. Pura y determinista.

### 2.2 Nuevo detector · `vin_inter_sesion` (D3)

- **Antes:** los duplicados de VIN se detectaban solo **dentro** de la
  sesión (`vin_duplicado_dwh`). El mismo chasis vendido en **sesiones
  distintas** (reimportación o doble conteo histórico) era invisible.
- **Después:** nuevo hallazgo `vin_inter_sesion` — lectura transversal
  read-only (mismo precedente que `nomos.backtest_regla`): el mismo chasis
  con `COUNT(DISTINCT session_id) > 1`. Severidad `warn`. Sin monto. Refs:
  `chasis` + `sesiones` (lista de ids citada).
- **Impacto en cifras:** `total` crece cuando aplica. Ningún monto se mueve.
  La sesión conserva su flujo; el hallazgo apunta a la historia.

### 2.3 Endurecimiento de honestidad · los ceros fabricados no son precio

Este es el único cambio que toca funciones existentes (`_mxn`, `_al_riesgo`,
el bloque `llegado_sin_venta`). Fundado en la semántica verificada del
pipeline:

- `importaciones.precio == 0.0` = **slice de precio VACÍO** del DWH
  (`concentrado1` arma `'.000'` de un campo en blanco), no un auto que valga
  cero.
- `extraccion_facturas.amount == '0,00'` = **fabricación** de `PDFs_v2`
  (`:819/:849`) cuando su regex de precio no casa, no un importe real de $0.

| | Antes | Después |
|---|---|---|
| `_mxn` (suma de precios DWH) | `precio is not None` → 0.0 se sumaba como $0 y contaba como "con precio" | `if r["precio"]` → 0.0 se declara **sin precio, no se estima** |
| `_al_riesgo` (valor en riesgo) | marcaba unidades con `precio is not None` (0.0 al riesgo con valor 0) | `if r["precio"]` → 0.0 no aporta valor (igual que antes: aportaba 0) |
| `llegado_sin_venta` (importes PDF) | `amount` que parsea a 0 contaba como "legible" y se sumaba como $0 | `if m` → el 0 fabricado se declara **ilegible/en cero: no se suma** |

- **Impacto en `valor_en_riesgo_mxn`:** **ninguno.** Un cero nunca aportó al
  total; el cambio solo lo reclasifica de "con precio $0" a "sin precio". La
  cifra citada es idéntica byte a byte.
- **Impacto visible:** los conteos honestos de "N unidades sin precio: su
  valor no se estima" y "N importes ilegibles o en cero: no se suman" **crecen**
  — el sistema deja de afirmar un $0 que no es real. Es la ley cero-snake-oil
  actuando sobre datos que ya estaban envenenados aguas arriba (los detectamos
  en el borde; el pipelegado no se toca).

---

## 3. VALIDACIÓN — cambios

### 3.1 Seis reglas nuevas (16 → 22)

Todas aditivas, sobre las mismas filas, con evidencia de semántica verificada.
Cada una se reporta también en cero (conformidad probada es un hecho que se
muestra):

| Clave | Fuente | Qué valida |
|---|---|---|
| `val-dwh-fecha` | DWH | `fecha_factura` no sigue el formato documentado `DDMMYY` (6 dígitos, día 01-31, mes 01-12). |
| `val-dwh-precio-cero` | DWH | `precio == 0` — campo de precio vacío del DWH, no un auto que valga cero. |
| `val-pdf-importe-cero` | PDF | `amount` extrae exactamente 0 — la fabricación `'0,00'` de la extracción. |
| `val-dwh-vin-chars` | DWH | VIN de largo correcto con **I/O/Q** (ISO 3779 los prohíbe; suele ser error de OCR O↔0, I↔1). |
| `val-pdf-vin-chars` | PDF | Igual, sobre facturas. |
| `val-pdf-moneda-cat` | PDF | `moneda` fuera de un catálogo ISO 4217 declarado del dominio (caza el centinela `'No se encontro coincidencia'` y typos). |

- **Impacto en `conformidad_pct`:** **SÍ cambia.** Ahora refleja 22 reglas en
  vez de 16. Para los mismos datos, el porcentaje **puede bajar** — el
  certificado es más estricto, no una regresión. Una fila que antes era 100%
  conforme y trae un VIN con 'O', un precio en 0 o una fecha sucia ahora se
  cuenta (una vez) como no conforme.
- **Impacto en el Radar:** las nuevas reglas son severidad `warn` (no
  `jn-norma`), así que **no** elevan una urgencia crítica de "glosa segura";
  entran al conteo de violaciones abiertas como el resto.
- **Bug atrapado:** la regla de moneda reusó por error la clave
  `val-pdf-moneda` (que ya pertenece al obligatorio "factura sin moneda").
  Dos reglas con la misma clave habrían corrompido también el ciclo de vida
  O1 (una disposición afectaría a ambas). Renombrada a `val-pdf-moneda-cat`.

---

## 4. Detectores descartados o reformados (la verificación hizo su trabajo)

El plan exige verificar la semántica real **antes** de codificar; como no hay
DB de producción, la evidencia es lo que el pipelegado escribe. Cuatro de los
ocho propuestos no sobrevivieron intactos:

| Propuesto | Veredicto | Evidencia (file:line del pipeline) |
|---|---|---|
| **D2 · incoherencia_temporal** | ❌ descartado, ⟳ rescatado como `val-dwh-fecha` | `fecha_factura` es `DDMMYY` invertido (`concentrado1.py:179`), NO ordenable; `fecha_pedimento` es un slice crudo de 8 chars (`concentrado1.py:195`) que el pipeline **nunca parsea** — formato indeterminable e incomparable. Comparar ambas sería inventar. Se rescató lo verificable: validar `fecha_factura` contra su propio formato documentado. |
| **D4 · patente_primeriza** | ❌ descartado | `patente` sale de `re.findall` **aplanado sobre todas las líneas** (`concentrado1.py:187-192`) y se desalinea de fila (AUDITORIA:102) — puede traer la patente del pedimento equivocado. Detectar "patente nunca vista" sobre un campo no confiable = falsos positivos. |
| **D6 · j_sin_leyenda** | ❌ descartado | `leyenda` se puebla **solo en la fila 0 de cada PDF** (`PDFs_v2.py:509`, `:887`, `:1061`); el resto es `NaN` por construcción y no correlaciona con el `j_y_n` por fila. Además contiene "shipping marks"/origen-UE, nunca T-MEC/certificado. Ruido puro — mismo precedente honesto que la regla `C.O + USA = J` no evaluada. |
| **D7 · dígito verificador ISO-3779** | ⟳ reformado a `val-*-vin-chars` | La flota es VIN europeo `WAU…` (`res.txt`); el dígito verificador (posición 9) solo obliga a VIN norteamericanos (primer char 1-5) — dispararía sobre casi nada. Se reformó a la parte verificable y valiosa: caracteres prohibidos I/O/Q, que sí caza errores de OCR reales. |

**Neto:** de 8 propuestos → 6 embarcados (D1, D3, D5, D7-reformado, D8, D2-rescate),
2 muertos (D4, D6). Menos detectores, cero ruido.

---

## 5. Impacto consolidado sobre cifras citadas

| Cifra | ¿Cambió? | Cómo |
|---|---|---|
| Regla de casamiento | No | — |
| `flujo.*` (vendidos/conciliados/llegados/pct) | No | — |
| **`valor_en_riesgo_mxn`** | **No** | El único detector que lo habría subido (D2) se descartó; la reclasificación de ceros no mueve la suma (0 aportaba 0). |
| `total` (conteo de fugas CONCILIA) | Sí, ↑ | +2 clases posibles (pedimento_sin_unidades, vin_inter_sesion). |
| Notas "sin precio" / "ilegible o en cero" | Sí, ↑ | Los ceros fabricados/vacíos ahora se declaran, no se suman como $0. |
| **`conformidad_pct`** (VALIDACIÓN) | **Sí, puede ↓** | Ahora sobre 22 reglas; el certificado es más estricto. No es regresión. |
| `total_violaciones` (VALIDACIÓN) | Sí, ↑ posible | Las nuevas reglas pueden marcar filas antes no contadas. |

---

## 6. Determinismo y consistencia (mantenidos)

- Todos los detectores nuevos son **lectura pura y determinista**; hay test de
  **doble corrida idéntica** (`conciliar(conn,sid) == conciliar(conn,sid)`).
- CONCILIA y el grafo siguen consistentes (misma regla de casamiento).
- `Sustrato` sigue siendo el único escritor de `ag_*`; nada de esto escribe.
- El pipelegado **no se tocó**: los ceros fabricados y las fechas sucias se
  **detectan en el borde** (los motores), no se corrigen aguas arriba.

---

## 7. Cómo verificar

```
python3 -m pytest tests/test_concilia.py tests/test_validacion.py -q
python3 -m pytest tests/ -q          # baseline: 486 verdes, 4 skipped
python3 -m ruff check .              # limpio
npx eslint static                    # 0 errores
```

Tests nuevos: `test_pedimento_sin_unidades`, `test_vin_inter_sesion`,
`test_cero_fabricado_no_es_precio_real`, `test_ola2_lectura_pura_doble_corrida`
(CONCILIA); `test_ola2_reglas_nuevas`, `test_ola2_conformes_no_disparan_reglas_nuevas`
(VALIDACIÓN); conteo de reglas actualizado 16→22.
