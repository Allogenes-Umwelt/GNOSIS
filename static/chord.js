/* GNOSIS · Chord de Ingesta — la vía documental como anillo bipartito.
   Hemisferio izquierdo = fuentes (artefactos, por kind); derecho =
   entidades producidas (por tipo); las cintas cruzan el centro, grosor
   proporcional a los fragmentos citados. El arco de una fuente = la suma
   de sus cintas salientes (cuánto conocimiento produjo): una fuente FRÍA
   (nadie la cita) es un arco delgado con ANILLO magenta y sin cintas — la
   ausencia se vuelve visible. Determinista: mismo JSON → mismos ángulos y
   cintas (todo ordenado). Hover aísla las cintas de un arco; clic emite
   'chord-select' para el dossier. Etiquetas radiales fuera del anillo,
   suprimidas por umbral angular (sin colisión) y siempre visibles en
   hover. AAA en ambos temas (tokens). Estático con prefers-reduced-motion;
   canvas retina-nítido, redibuja al redimensionar y cambiar tema. */
(function () {
  'use strict';

  var GAP = 0.12;          // hueco angular entre hemisferios (arriba y abajo)
  var MIN_ARCO = 0.6;      // peso mínimo de un arco (frío/huérfano visible pero fino)

  function montar(cont) {
    var canvas = cont.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var info = document.querySelector(cont.getAttribute('data-info') || '') || null;
    var tablaCont = document.querySelector(cont.getAttribute('data-tabla') || '') || null;
    var colores = {}, datos = null, layout = null, hover = null, sel = null;
    var foco = -1;      // índice del arco con foco de TECLADO (A11y)
    var cssW = 0, cssH = 0, cx = 0, cy = 0, R = 0, rIn = 0, arcW = 0;
    // C4 · pirotecnia disciplinada (toda apagada con prefers-reduced-motion)
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var animando = false, entrada = null, idsPrevios = null;

    function conAlfa(hex, a) {
      var h = (hex || '#00D4FF').replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
             ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    function leerColores() {
      var cs = getComputedStyle(document.documentElement);
      colores = {
        acc: cs.getPropertyValue('--acc-text').trim() || '#00D4FF',
        danger: cs.getPropertyValue('--danger').trim() || '#F57F9C',
        line: cs.getPropertyValue('--line-2').trim() || '#777',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t2: cs.getPropertyValue('--t2').trim() || '#CCC',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA'
      };
    }

    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      cssW = caja.width;
      cssH = Math.max(460, caja.height);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = cssW / 2; cy = cssH / 2;
      // radio con margen para etiquetas: la etiqueta más larga vive fuera
      R = Math.max(60, Math.min(cssW, cssH) / 2 - 150);
      arcW = 12;
      rIn = R;                 // las cintas anclan en el borde interior del arco
    }

    function punto(ang, radio) {
      return [cx + radio * Math.cos(ang), cy + radio * Math.sin(ang)];
    }

    // Reparte un rango angular [ini,fin] entre items ∝ peso, con huecos por
    // grupo. Devuelve cada item con {a0,a1} (su sub-arco). Determinista.
    function repartir(items, ini, fin) {
      var total = items.reduce(function (s, it) { return s + it._peso; }, 0) || 1;
      var grupos = [];
      items.forEach(function (it) {
        if (!grupos.length || grupos[grupos.length - 1].g !== it.grupo) {
          grupos.push({ g: it.grupo, items: [] });
        }
        grupos[grupos.length - 1].items.push(it);
      });
      var hueco = Math.min(0.04, (fin - ini) * 0.02);
      var disponible = (fin - ini) - hueco * Math.max(0, grupos.length - 1);
      var a = ini;
      grupos.forEach(function (grp, gi) {
        if (gi > 0) a += hueco;
        grp.items.forEach(function (it) {
          var span = disponible * (it._peso / total);
          it.a0 = a; it.a1 = a + span; it.aMid = a + span / 2;
          a += span;
        });
      });
    }

    function calcularLayout() {
      if (!datos) return;
      // flujo por arco = suma de las cintas incidentes (invariante del chord)
      var flujo = {};
      datos.cintas.forEach(function (c) {
        flujo[c.artefacto_id] = (flujo[c.artefacto_id] || 0) + c.peso;
        flujo[c.entidad_id] = (flujo[c.entidad_id] || 0) + c.peso;
      });
      var arts = datos.artefactos.map(function (a) {
        return Object.assign({ lado: 'art', _peso: Math.max(MIN_ARCO, flujo[a.id] || 0) }, a);
      });
      var ents = datos.entidades.map(function (e) {
        return Object.assign({ lado: 'ent', _peso: Math.max(MIN_ARCO, flujo[e.id] || 0) }, e);
      });
      // izquierda (art): de π/2+G a 3π/2−G ; derecha (ent): de −π/2+G a π/2−G
      repartir(arts, Math.PI / 2 + GAP, 3 * Math.PI / 2 - GAP);
      repartir(ents, -Math.PI / 2 + GAP, Math.PI / 2 - GAP);
      var porId = {};
      arts.concat(ents).forEach(function (n) { porId[n.id] = n; });

      // anclas de cinta: subdividir cada arco ∝ peso de sus cintas
      var cursor = {};
      arts.concat(ents).forEach(function (n) { cursor[n.id] = n.a0; });
      var cintas = datos.cintas.slice().sort(function (x, y) {
        return y.peso - x.peso || (x.artefacto_id < y.artefacto_id ? -1 : 1);
      }).map(function (c) {
        var A = porId[c.artefacto_id], E = porId[c.entidad_id];
        if (!A || !E) return null;
        var sa = (A.a1 - A.a0) * (c.peso / A._peso);
        var se = (E.a1 - E.a0) * (c.peso / E._peso);
        var a0 = cursor[A.id]; cursor[A.id] += sa;
        var e0 = cursor[E.id]; cursor[E.id] += se;
        return { c: c, aA0: a0, aA1: a0 + sa, aE0: e0, aE1: e0 + se, A: A, E: E };
      }).filter(Boolean);

      layout = { arcos: arts.concat(ents), cintas: cintas, porId: porId };
    }

    function cintaPath(cn) {
      var pA0 = punto(cn.aA0, rIn), pE1 = punto(cn.aE1, rIn);
      ctx.beginPath();
      ctx.moveTo(pA0[0], pA0[1]);
      ctx.arc(cx, cy, rIn, cn.aA0, cn.aA1);
      ctx.quadraticCurveTo(cx, cy, pE1[0], pE1[1]);
      ctx.arc(cx, cy, rIn, cn.aE1, cn.aE0, true);
      ctx.quadraticCurveTo(cx, cy, pA0[0], pA0[1]);
      ctx.closePath();
    }

    function puntoBezier(p0, c, p2, t) {
      var u = 1 - t;
      return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0],
              u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]];
    }

    function focoId() {
      return (foco >= 0 && layout && layout.arcos[foco]) ? layout.arcos[foco].id : null;
    }

    function dibujar(ts) {
      if (!layout) return;
      ctx.clearRect(0, 0, cssW, cssH);
      var hid = hover ? hover.id : (focoId() || (sel ? sel.id : null));
      // k de entrada: los arcos nuevos barren su ángulo una sola vez
      var kEnt = 1;
      if (entrada) {
        if (entrada.inicio == null) entrada.inicio = ts || 0;
        kEnt = Math.min(1, ((ts || 0) - entrada.inicio) / 600);
        kEnt = 1 - Math.pow(1 - kEnt, 3);
        if (kEnt >= 1) entrada = null;
      }
      function angFin(n) {
        return (entrada && entrada.ids[n.id]) ? n.a0 + (n.a1 - n.a0) * kEnt : n.a1;
      }

      // ── cintas primero (bajo los arcos) ──
      layout.cintas.forEach(function (cn) {
        var activa = hid && (cn.A.id === hid || cn.E.id === hid);
        var alfa = hid ? (activa ? 0.6 : 0.06) : 0.24;
        cintaPath(cn);
        ctx.fillStyle = conAlfa(colores.acc, alfa);
        ctx.fill();
        if (activa) {
          ctx.strokeStyle = conAlfa(colores.acc, 0.85);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // ── flux en hover: partículas recorriendo las cintas del arco ──
      if (!reduce && hover) {
        layout.cintas.forEach(function (cn, idx) {
          if (cn.A.id !== hid && cn.E.id !== hid) return;
          var p0 = punto((cn.aA0 + cn.aA1) / 2, rIn);
          var p2 = punto((cn.aE0 + cn.aE1) / 2, rIn);
          var np = 3;
          for (var q = 0; q < np; q++) {
            var t = (((ts || 0) / 1800) + q / np + idx * 0.11) % 1;
            var pt = puntoBezier(p0, [cx, cy], p2, t);
            ctx.beginPath();
            ctx.fillStyle = colores.acc;
            ctx.globalAlpha = 0.35 + 0.5 * Math.sin(t * Math.PI);
            ctx.arc(pt[0], pt[1], 1.7, 0, 6.283);
            ctx.fill();
          }
        });
        ctx.globalAlpha = 1;
      }

      // ── arcos + etiquetas ──
      var minLabel = 13 / (R + 26);     // umbral angular anti-colisión
      layout.arcos.forEach(function (n) {
        var esHover = n.id === hid;
        var fria = n.lado === 'art' && n.fria;
        var col = fria ? colores.danger : colores.acc;
        var a1 = angFin(n);
        if (a1 <= n.a0) return;         // aún no entra (barrido en curso)
        // glow tokenizado en arcos vivos (no fríos): profundidad, no ruido
        if (!fria) { ctx.shadowColor = conAlfa(colores.acc, esHover ? 0.9 : 0.5);
          ctx.shadowBlur = esHover ? 14 : 8; }
        ctx.beginPath();
        ctx.arc(cx, cy, R + arcW / 2, n.a0, a1);
        ctx.strokeStyle = esHover ? col : conAlfa(col, fria ? 0.9 : 0.8);
        ctx.lineWidth = esHover ? arcW + 3 : arcW;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // anillo punteado de frío (la ausencia hecha visible)
        if (fria) {
          ctx.beginPath();
          ctx.arc(cx, cy, R + arcW + 3, n.a0, a1);
          ctx.strokeStyle = conAlfa(colores.danger, 0.7);
          ctx.lineWidth = 1.4; ctx.setLineDash([2, 3]);
          ctx.stroke(); ctx.setLineDash([]);
        }
        // etiqueta radial fuera del anillo (o en hover) — solo si ya entró
        if (kEnt >= 1 && ((n.a1 - n.a0) >= minLabel || esHover)) {
          dibujarEtiqueta(n, esHover);
        }
      });
      ctx.lineWidth = 1;
      dibujarNucleo();
    }

    // rAF: corre solo con hover (flux) o entrada en curso, y con la pestaña
    // visible; estático absoluto con prefers-reduced-motion.
    function animar() {
      if (reduce || (!hover && !entrada)) { dibujar(0); return; }
      if (animando) return;
      animando = true;
      (function paso(ts) {
        if (document.hidden) { animando = false; return; }
        dibujar(ts);
        if (!hover && !entrada) { animando = false; return; }
        requestAnimationFrame(paso);
      })(0);
    }

    function dibujarEtiqueta(n, esHover) {
      var ang = n.aMid;
      var izq = Math.cos(ang) < 0;     // hemisferio izquierdo → texto a la derecha del ancla, alineado a la derecha
      var r = R + arcW + (n.lado === 'art' && n.fria ? 12 : 8);
      var p = punto(ang, r);
      var texto = String(n.nombre || '').slice(0, 26);
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.rotate(izq ? ang + Math.PI : ang);
      ctx.font = (esHover ? '700 ' : '') + '10px "JetBrains Mono", monospace';
      ctx.fillStyle = esHover ? colores.t1 : (n.agregado ? colores.t3 : colores.t2);
      ctx.textAlign = izq ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, izq ? -4 : 4, 0);
      ctx.restore();
    }

    function dibujarNucleo() {
      var r = datos.resumen;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 26px "JetBrains Mono", monospace';
      ctx.fillStyle = r.cobertura >= 33 ? colores.acc : colores.danger;
      ctx.fillText(r.cobertura + '%', cx, cy - 6);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = colores.t3;
      ctx.fillText('COBERTURA', cx, cy + 12);
      ctx.fillText(r.fuentes + ' fuentes · ' + r.frias + ' frías', cx, cy + 26);
    }

    // ── hit-test por ángulo + radio ──
    function arcoEn(mx, my) {
      var dx = mx - cx, dy = my - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < R - 6 || d > R + arcW + 16) return null;
      var ang = Math.atan2(dy, dx);
      var mejor = null;
      layout.arcos.forEach(function (n) {
        var a = ang;
        // normalizar al rango del arco (los arcos izquierdos cruzan π)
        while (a < n.a0) a += 2 * Math.PI;
        while (a > n.a1 + 2 * Math.PI) a -= 2 * Math.PI;
        if (a >= n.a0 && a <= n.a1) mejor = n;
      });
      return mejor;
    }

    canvas.addEventListener('mousemove', function (ev) {
      if (!layout) return;
      var caja = canvas.getBoundingClientRect();
      var n = arcoEn(ev.clientX - caja.left, ev.clientY - caja.top);
      var cambio = (!!n !== !!hover) || (n && hover && n.id !== hover.id);
      hover = n;
      canvas.style.cursor = n ? 'pointer' : 'default';
      if (cambio) { animar(); pintarInfo(n); }
    });
    canvas.addEventListener('mouseleave', function () {
      if (hover) { hover = null; dibujar(0); pintarInfo(null); }
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && (hover || entrada)) animar();
    });
    function emitirSel(n) {
      sel = n;
      cont.dispatchEvent(new CustomEvent('chord-select', {
        detail: n ? { id: n.id, lado: n.lado, nombre: n.nombre,
                      agregado: !!n.agregado } : null
      }));
    }
    canvas.addEventListener('click', function (ev) {
      if (!layout) return;
      var caja = canvas.getBoundingClientRect();
      var n = arcoEn(ev.clientX - caja.left, ev.clientY - caja.top);
      emitirSel(n);
      dibujar(0);
    });

    // ── teclado (A11y): flechas recorren arcos, Enter abre el dossier ──
    canvas.addEventListener('keydown', function (ev) {
      if (!layout || !layout.arcos.length) return;
      var k = ev.key;
      if (k === 'ArrowRight' || k === 'ArrowDown') {
        foco = (foco + 1) % layout.arcos.length;
      } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
        foco = (foco <= 0 ? layout.arcos.length : foco) - 1;
      } else if (k === 'Enter' || k === ' ') {
        if (foco >= 0) emitirSel(layout.arcos[foco]);
      } else if (k === 'Escape') {
        foco = -1; emitirSel(null);
      } else { return; }
      ev.preventDefault();
      pintarInfo(foco >= 0 ? layout.arcos[foco] : null);
      dibujar(0);
    });
    canvas.addEventListener('blur', function () { foco = -1; dibujar(0); });

    // ── tabla accesible: los mismos datos que el chord, para lectores ──
    var tablaBtn = document.getElementById('ch-tabla-btn');
    function construirTabla() {
      if (!tablaCont || !datos) return;
      function esc2(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
      }
      var f = datos.artefactos.map(function (a) {
        return '<tr><th scope="row">' + esc2(a.nombre) + '</th><td>' + esc2(a.grupo) +
          '</td><td>' + (a.agregado ? a.n : a.fragmentos) + '</td><td>' +
          (a.agregado ? '—' : a.entidades) + '</td><td>' +
          (a.fria ? 'fría' : 'metabolizada') + '</td></tr>';
      }).join('');
      tablaCont.innerHTML =
        '<table><caption>Fuentes de la sesión · cobertura ' + datos.resumen.cobertura +
        '%</caption><thead><tr><th scope="col">Fuente</th><th scope="col">Tipo</th>' +
        '<th scope="col">Fragmentos</th><th scope="col">Entidades</th>' +
        '<th scope="col">Estado</th></tr></thead><tbody>' + f + '</tbody></table>';
    }
    if (tablaBtn) tablaBtn.addEventListener('click', function () {
      var mostrar = tablaCont.hidden;
      if (mostrar) construirTabla();
      tablaCont.hidden = !mostrar;
      tablaBtn.setAttribute('aria-pressed', String(mostrar));
      tablaBtn.textContent = mostrar ? 'Ver como chord' : 'Ver como tabla';
    });

    function pintarInfo(n) {
      if (!info) return;
      if (!n) {
        var r = datos.resumen;
        info.textContent = 'COBERTURA ' + r.cobertura + '% · ' + r.fuentes +
          ' FUENTES · ' + r.frias + ' FRÍAS · ' + r.entidades + ' ENTIDADES';
        return;
      }
      if (n.lado === 'art') {
        info.textContent = (n.fria ? 'FRÍA · ' : '') + n.nombre + ' · ' +
          n.fragmentos + ' frag · ' + n.entidades + ' entidad(es) citante(s)';
      } else {
        info.textContent = n.nombre + ' · ' + (n.agregado ? n.n + ' agrupadas'
          : n.citas + ' citas · ' + n.fuentes + ' fuente(s)');
      }
    }

    function cargar() {
      fetch('/api/v1/autogenes/chord_ingesta')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) { if (info) info.textContent = (j && j.error) || 'SIN DATOS'; return; }
          datos = j;
          calcularLayout();
          // barrido de entrada solo para arcos NUEVOS respecto a la carga previa
          var idsAhora = {};
          layout.arcos.forEach(function (n) { idsAhora[n.id] = true; });
          if (!reduce && idsPrevios) {
            var nuevos = {}, hay = false;
            Object.keys(idsAhora).forEach(function (id) {
              if (!idsPrevios[id]) { nuevos[id] = true; hay = true; }
            });
            entrada = hay ? { ids: nuevos, inicio: null } : null;
          }
          idsPrevios = idsAhora;
          pintarInfo(null);
          animar();
        })
        .catch(function () { if (info) info.textContent = 'SIN CONEXIÓN'; });
    }

    leerColores();
    tamano();
    window.addEventListener('resize', function () { tamano(); calcularLayout(); dibujar(0); });
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); dibujar(0); }, 60);
    });
    cont.chordAPI = { recargar: cargar };
    cargar();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.ch-lienzo').forEach(montar);
  });
})();
