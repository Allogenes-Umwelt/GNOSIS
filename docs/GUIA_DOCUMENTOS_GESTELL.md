# Guía de documentos GESTELL — cómo se hacen siempre

Cómo producir **cualquier** documento de marca de GNOSIS (atlas, memos,
one-pagers, propuestas, tableros de presentación) de forma consistente con el
**GESTELL Brand Operating System**. No es una sugerencia de estilo: es el
contrato. Un documento que se desvíe de esto no es "otra versión" — está mal.

> **Fuente de verdad:** los volúmenes del brandbook (`GESTELL Vol III`,
> `Vol VI master`, y sucesivos). Este archivo es un **destilado operativo** de
> ellos, no su reemplazo. Cuando el brandbook y esta guía difieran, gana el
> brandbook — y hay que corregir esta guía.

Ejemplar de referencia (construido con estas reglas): el **Atlas de
arquitectura** (`docs/ARQUITECTURA.md` renderizado como artifact). Su generador
vive en el historial de la sesión y sigue este documento al pie.

---

## 0. Las tres reglas que no se rompen

1. **Los assets de marca se extraen VERBATIM del brandbook — jamás se
   re-dibujan ni se aproximan.** El isotipo, los gradientes, el wordmark: se
   copian byte a byte del volumen. Aproximar la marca "a ojo" es el error más
   caro y el más fácil de cometer.
2. **Las fuentes licenciadas se incrustan como data-URI** (no se enlazan a un
   CDN — la CSP de un artifact lo bloquea, y un enlace roto degrada en
   silencio). Solo se incrusta lo que el proyecto tenga licenciado.
3. **Todo documento vive en los dos temas (Nocturne / Daylight) con contraste
   AAA en ambos**, y el magenta se reserva para alerta. Sin excepciones.

---

## 1. El isotipo — ley de uso

El isotipo es un **hexágono** (la "matriz" GESTELL) con ocho **arcos radiantes**
desde el centro —trazados con un gradiente radial recortado a la matriz— y un
**núcleo cian**. Hay **DOS variantes canónicas** según el fondo; usar la que
corresponde al tema (NO poner la variante oscura sobre una placa — es un error).

- **Nocturne (`#isotipo-header`, VOL VI)** — fondos oscuros. Arcos con
  `ai-core-energy` (65–100% → `#FAFAF8`), hexágono `#FAFAF8`.
- **Daylight (`#isotipo-header-light`, VOL III)** — fondos claros. Arcos con
  `ai-core-energy-light` (mismos stops 0–35%, pero 65–100% → `#030303`: "energía
  contenida en estructura oscura sobre fondos claros"), hexágono `#030303`.
- Núcleo `#00D4FF` r=10.5 y clip `gstl-matrix` en **ambas**.

**NUNCA lo redibujes.** Copia los dos `<symbol>` y sus `<defs>` (ambos
gradientes + el clip) tal cual del brandbook, inyéctalos una vez, e instancia
con `<use>` la variante del tema.

```html
<!-- Inyectar UNA vez (defs + los DOS symbols), verbatim del brandbook -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="ai-core-energy" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
   <stop offset="0%" stop-color="#00D4FF"/><stop offset="15%" stop-color="#7B3FA0"/>
   <stop offset="35%" stop-color="#FF0066"/><stop offset="65%" stop-color="#FAFAF8"/>
   <stop offset="100%" stop-color="#FAFAF8"/></radialGradient>
  <radialGradient id="ai-core-energy-light" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
   <stop offset="0%" stop-color="#00D4FF"/><stop offset="15%" stop-color="#7B3FA0"/>
   <stop offset="35%" stop-color="#FF0066"/><stop offset="65%" stop-color="#030303"/>
   <stop offset="100%" stop-color="#030303"/></radialGradient>
  <clipPath id="gstl-matrix">
   <polygon points="250,90 371.24,160 371.24,300 250,370 128.76,300 128.76,160"/></clipPath>
  <!-- ARCS = los 8 <path d="M250 230 A180 180 0 0 1 …"/> (idénticos en ambas) -->
  <symbol id="isotipo-header" viewBox="30 10 440 440">
   <g clip-path="url(#gstl-matrix)" fill="none" stroke="url(#ai-core-energy)" stroke-width="8.5">
     <!-- ARCS --></g>
   <polygon points="250,90 371.24,160 371.24,300 250,370 128.76,300 128.76,160"
            fill="none" stroke="#FAFAF8" stroke-width="8" stroke-linejoin="round"/>
   <circle cx="250" cy="230" r="10.5" fill="#00D4FF"/></symbol>
  <symbol id="isotipo-header-light" viewBox="30 10 440 440">
   <g clip-path="url(#gstl-matrix)" fill="none" stroke="url(#ai-core-energy-light)" stroke-width="8.5">
     <!-- ARCS --></g>
   <polygon points="250,90 371.24,160 371.24,300 250,370 128.76,300 128.76,160"
            fill="none" stroke="#030303" stroke-width="8" stroke-linejoin="round"/>
   <circle cx="250" cy="230" r="10.5" fill="#00D4FF"/></symbol>
</defs></svg>

<!-- Instanciar ambas y conmutar por tema con CSS -->
<span class="iso-wrap">
  <svg class="iso iso-n" width="30" height="30" aria-hidden="true"><use href="#isotipo-header"/></svg>
  <svg class="iso iso-d" width="30" height="30" aria-hidden="true"><use href="#isotipo-header-light"/></svg>
</span>
```

```css
.iso-n{display:block}.iso-d{display:none}
@media (prefers-color-scheme: light){.iso-n{display:none}.iso-d{display:block}}
:root[data-theme="dark"] .iso-n{display:block}:root[data-theme="dark"] .iso-d{display:none}
:root[data-theme="light"] .iso-n{display:none}:root[data-theme="light"] .iso-d{display:block}
```

- **Logotipo = isotipo + wordmark.** El wordmark es `GESTELL` en Akzidenz-Grotesk
  Bold, `letter-spacing` grande (24 en la unidad del master); fill `#FAFAF8` en
  Nocturne, `#030303` en Daylight (misma lógica que el hexágono).
- **No** recolorees los arcos, **no** cambies el radio del núcleo, **no** quites
  el clip, **no** uses la variante oscura sobre placa en Daylight. Si necesitas
  otra variante (mono, lockup completo), tómala del brandbook — no la fabriques.

---

## 2. Tipografía — tres caras, una jerarquía

| Rol | Familia (`--font-*`) | Uso |
|-----|----------------------|-----|
| **Display** `--font-d` | `'Akzidenz-Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif` (peso **700**) | Titulares (h1/h2/h3), eyebrows, labels, wordmark, cifras grandes. Uppercase + tracking en labels. |
| **Body** `--font-b` | `'Helvetica Neue LT Pro','Helvetica Neue',Helvetica,Arial,sans-serif` | Texto corrido, intros, celdas de tabla. `line-height` 1.6–1.7. |
| **Mono** `--font-mono` | `'Courier New',Courier,monospace` | Códigos, rutas, tokens, captions técnicos, meta. **Courier — no `ui-monospace`.** Es la firma de "dossier técnico". |

**Escala** (del brandbook, en px): display 72/42/36 · head 24/18/16 · sub-head
12 · emphasis 14 · body 11/10 · small 9 · caption 8 · micro 7. En impresión se
usan tal cual; **en web se adapta el cuerpo a ~15px** para legibilidad, pero se
conserva el *carácter*: display monumental y tenso, labels diminutos con
tracking pesado.

**Tracking (letter-spacing) — disciplina GESTELL:**
- Eyebrows / section-labels: `.24–.30em`, uppercase, peso 700, en color de
  acento.
- Wordmark de header: `.34–.38em`.
- Micro-labels de tabla / caption: `.12–.14em`, uppercase.
- Cuerpo y titulares grandes: tracking negativo leve (`-.01em`).

**Incrustar la fuente licenciada** (solo lo que esté licenciado; el pedido
MyFonts trae `Akzidenz-Grotesk Pro Bold`). Convertir a woff2 y embeber:

```css
@font-face{
  font-family:'Akzidenz-Grotesk'; font-style:normal; font-weight:700;
  font-display:swap;
  src:url(data:font/woff2;base64,<BASE64>) format('woff2');
}
```

```bash
# otf → woff2 (≈3× más chico) y base64 para el data-URI
python3 -c "from fontTools.ttLib import TTFont; f=TTFont('Akz.otf'); f.flavor='woff2'; f.save('Akz.woff2')"
base64 -w0 Akz.woff2
```

Helvetica Neue LT Pro y Courier New **no se incrustan**: caen a Helvetica/Arial
y Courier del sistema — como hace el propio brandbook.

---

## 3. Paleta — los cuatro colores ontológicos + grounds

El sistema tiene cuatro hues ontológicos; cada **volumen** toma uno como acento.
Un documento de GNOSIS usa **gnosis** (cian, el `--color-action-primary` del
sistema).

| Token | Nocturne | Daylight | Papel |
|-------|----------|----------|-------|
| `--gnosis` | `#00D4FF` | `#007C99` (gnosis-700) | **Acento** — eyebrows, enlaces, códigos, núcleo del isotipo, cifras clave |
| `--telos` | `#A4133C` · text `#F26B8A` | `#A4133C` | Alerta / glosa (magenta profundo) |
| `--umwelt` | `#FF0066` · text `#FF80AA` | `#8C0038` | Alerta / warn (magenta) |
| `--dasein` | `#7B3FA0` · text `#B99BD6` | `#633C8F` | Info / secundario |

**Grounds y neutros (Nocturne):** `--gstl-black #030303` · `--gstl-bg-2 #050505`
· `--gstl-bg-3 #0A0A0A` · hairline `--gstl-border #1A1A1A` ·
`--gstl-border-soft #333` · `--gstl-white #FAFAF8` · text `#FAFAF8 / #CCCCCC /
#8C8C8C`. En Daylight: fondo `#FAFAF8`, superficies `#FFFFFF / #F2F2EF`,
hairlines claras, texto `#050505 / #2C2C28 / #5E5E58`.

**Ley del magenta:** el magenta (telos/umwelt) se usa **SOLO como alerta real**
—violación, contradicción `≠`, riesgo— nunca como decoración ni como acento de
marca. El acento de marca es cian. (Es la misma ley que `static/styles.css`
del producto.)

Define la paleta como custom properties y **estiliza siempre a través de los
tokens**, nunca con hex crudo en componentes. Redefine los tokens bajo
`@media (prefers-color-scheme: dark/light)` **y** bajo
`:root[data-theme="dark"/"light"]` (el toggle del visor estampa `data-theme` y
debe ganar en ambos sentidos).

---

## 4. Motivos de layout

- **Header `.ph`.** Franja superior: isotipo (variante del tema) + wordmark
  espaciado a la izquierda, meta (`VOLUMEN — …`) a la derecha, `border-bottom`
  hairline.
- **Eyebrow / section-label.** Antecede a cada título: Akzidenz 700, ~10px,
  uppercase, `letter-spacing .24–.30em`, color de acento. Encodea estructura
  real (C4 · Nivel 1, PROCESO · BPMN) — no decora.
- **Retícula de métricas.** Cifras grandes en Akzidenz (tabular-nums) sobre
  celdas `bg-3` separadas por hairlines; micro-label en Courier uppercase.
- **`data-table`.** Headers Akzidenz uppercase tracked sobre `bg-3`; filas con
  separador hairline; primera columna en `text-1`; celdas de código en Courier,
  color de acento. Contenido ancho → `overflow-x:auto` en su contenedor.
- **Callout.** `background: bg-3; border-left: 3px solid <acento|alerta>`. Para
  una ley o advertencia, el borde es magenta y el título va en Akzidenz.
- **Diagramas.** En panel con hairline y fondo `bg-3`, caption en Courier
  uppercase. Mermaid nativo (```mermaid``` o `<pre class="mermaid">`); las
  compuertas/estados críticos se colorean con `classDef` (gate = magenta,
  inicio/acento = cian) para que el color semántico sobreviva cualquier tema del
  renderer.

---

## 5. Proceso de producción — checklist

Antes de dar por hecho un documento de marca:

1. **Assets verbatim.** ¿El isotipo/gradiente/wordmark salen copiados del
   brandbook, no dibujados a mano? (regla #0.1)
2. **Fuente.** ¿La cara licenciada va incrustada como data-URI woff2? ¿El resto
   cae a system stacks correctos?
3. **Tokens.** ¿Cero hex/px crudos en componentes? ¿Todo sale de custom
   properties?
4. **Dos temas.** ¿Definidos vía `@media` **y** `:root[data-theme]`? ¿Contraste
   **AAA** verificado en Nocturne **y** Daylight? ¿Se usa la **variante de
   isotipo correcta por tema** (`isotipo-header` / `isotipo-header-light`)?
5. **Magenta.** ¿Reservado a alerta? ¿El acento de marca es cian?
6. **Diagramas.** ¿Parse-validados headless (0 errores) antes de publicar? Un
   diagrama roto es un error box en el visor.
7. **Captura.** ¿Screenshot de ambos temas revisado a ojo? (canvas/SVG/tipografía
   se rompen en el hueco entre fuente y salida).
8. **Artifact.** Si es artifact: contenido self-contained (sin CDNs), `<style>`
   inline, sin `<!doctype>/<html>/<head>/<body>` propios (el harness los pone),
   `favicon` emoji estable entre redeploys, mismo `file_path` para conservar la
   URL.

**Validación de diagramas Mermaid (headless):**

```js
// node + playwright + mermaid: parsea cada bloque, reporta OK/FAIL
const { chromium } = require('playwright');
// … cargar mermaid.min.js, await mermaid.parse(bloque) por cada diagrama …
```

---

## 6. Anexo — anti-patrones (lo que delata un documento fuera de marca)

- Isotipo re-dibujado "parecido" (arcos planos sin gradiente, sin clip, núcleo
  de otro tamaño). → Extraer verbatim.
- Isotipo Nocturne (hexágono `#FAFAF8`) forzado a fondo claro con una placa
  oscura. → Existe `isotipo-header-light` canónico; úsalo.
- `ui-monospace`/Menlo/Consolas en vez de Courier. → Rompe la firma técnica.
- Magenta como color decorativo o de acento. → El acento es cian; magenta = alerta.
- Un solo tema, o segundo tema por inversión naïve con contraste roto.
- Fuente enlazada a un CDN (se bloquea/rompe en silencio). → data-URI.
- Bordes gruesos/redondeados por todos lados. → GESTELL es hairline `#1A1A1A`,
  esquinas mínimas, retícula técnica.
- Titulares swithout tracking, labels sin uppercase. → Falta la disciplina de
  spacing.

Referencias: brandbook GESTELL (Vols III/VI), `static/styles.css` (tokens del
producto), `docs/ARQUITECTURA.md` (ejemplar), C4 (c4model.com), BPMN 2.0 (OMG).
