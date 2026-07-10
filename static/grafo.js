/* GNOSIS · Grafo — el lienzo de fuerzas del caso (port del GrafoCanvas
   de KARELEN sobre el motor propio Fuerzas). Canvas 2D, anillos
   concéntricos por kind (nucleo → pedimento → marca/pais → vehiculo →
   artefacto → fragmento → entidad), trazo Z.O.E. (citas punteadas,
   relaciones con peso, brackets de esquina, anillo giratorio en la
   selección). Gestos: arrastrar nodo, pan, rueda y pinch para zoom,
   tap para inspeccionar (vecinos resaltados, resto atenuado).
   prefers-reduced-motion: el layout se asienta síncrono y queda quieto.
   Datos: /api/v1/autogenes/grafo — nunca inventados. */
(function () {
  'use strict';

  var ANILLOS = { nucleo: 0, producto: 100, pedimento: 175, marca: 265, pais: 265,
                  vehiculo: 360, artefacto: 480, fragmento: 550, entidad: 620 };
  var FUERZA_ANILLO = { nucleo: 0.5, producto: 0.28, pedimento: 0.3, marca: 0.3,
                        pais: 0.3, vehiculo: 0.12, artefacto: 0.14, fragmento: 0.1,
                        entidad: 0.14 };

  function radioDe(n) {
    var base = { nucleo: 14, pedimento: 7, marca: 9, pais: 8, vehiculo: 3.2,
                 artefacto: 6, fragmento: 2.2, entidad: 5.5, producto: 7 }[n.kind] || 4;
    return base + Math.min(6, Math.sqrt(n.grado || 0) * 0.9);
  }

  function q(sel) { return sel ? document.querySelector(sel) : null; }

  function montar(cont) {
    var canvas = cont.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var inspector = q(cont.getAttribute('data-inspector'));
    var estadoLinea = q(cont.getAttribute('data-estado'));
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    var nodos = [], enlaces = [], porId = {}, vecinos = {};
    var sim = null, animando = false, t0 = 0;
    var vista = { x: 0, y: 0, k: 1 };
    var sel = null, hover = null;
    var resalte = null;          // {nodos:{}, enlaces:{}} — camino/vecindario
    var colores = {};

    // Ley de marca: el canvas es "gráfico fino" — usa la variante AAA
    // por modo (--acc-text), nunca el cyan real fijo.
    function conAlfa(hex, a) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
             ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    function leerColores() {
      var cs = getComputedStyle(document.documentElement);
      colores = {
        acc: cs.getPropertyValue('--acc-text').trim() || '#00D4FF',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        linea2: cs.getPropertyValue('--line-2').trim() || '#777',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA',
        fondo: 'transparent'
      };
    }

    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = Math.max(420, caja.height) * dpr;
      canvas.style.height = Math.max(420, caja.height) + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function cargar(limite) {
      var url = '/api/v1/autogenes/grafo' + (limite ? '?limite_vehiculos=' + limite : '');
      if (estadoLinea) estadoLinea.textContent = 'CARGANDO EL CASO…';
      fetch(url).then(function (r) { return r.json(); }).then(function (g) {
        if (!g || g.error) {
          if (estadoLinea) estadoLinea.textContent = g && g.error ? g.error.toUpperCase() : 'SIN DATOS';
          return;
        }
        nodos = g.nodos; enlaces = g.enlaces; porId = {}; vecinos = {};
        nodos.forEach(function (n) { porId[n.id] = n; });
        enlaces.forEach(function (e) {
          (vecinos[e.source] = vecinos[e.source] || {})[e.target] = true;
          (vecinos[e.target] = vecinos[e.target] || {})[e.source] = true;
        });
        sel = null; pintarInspector(null);
        if (estadoLinea) {
          estadoLinea.textContent = nodos.length + ' NODOS · ' + enlaces.length +
            ' ENLACES · SESIÓN ' + (g.session_id || '—');
        }
        var nucleo = nodos.find(function (n) { return n.kind === 'nucleo'; });
        if (nucleo) { nucleo.x = 0; nucleo.y = 0; nucleo.fx = 0; nucleo.fy = 0; }
        sim = Fuerzas.simulacion(nodos, enlaces,
                                 { anillos: ANILLOS, fuerzaPorKind: FUERZA_ANILLO });
        if (reduce) { sim.correr(300); encuadrar(); dibujar(0); }
        else { sim.correr(60); encuadrar(); animar(); }
        cont.dispatchEvent(new CustomEvent('grafo:listo', { detail: { nodos: nodos } }));
      }).catch(function () {
        if (estadoLinea) estadoLinea.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
      });
    }

    function animar() {
      if (animando) return;
      animando = true;
      (function paso(ts) {
        var alfa = sim ? sim.tick() : 0;
        dibujar(ts);
        if (alfa > 0.004 || arrastre.nodo) requestAnimationFrame(paso);
        else { animando = false; encuadrar(); dibujar(ts); }
      })(0);
    }

    // encuadre automático: la caja del grafo llena el 84% del lienzo
    function encuadrar() {
      if (!nodos.length) return;
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      nodos.forEach(function (n) {
        if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
      });
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var k = Math.min(6, Math.max(0.25,
        0.84 * Math.min(w / Math.max(maxX - minX, 60), h / Math.max(maxY - minY, 60))));
      vista.k = k;
      vista.x = -((minX + maxX) / 2) * k;
      vista.y = -((minY + maxY) / 2) * k;
    }

    // ── dibujo ───────────────────────────────────────────────────────
    function dibujar(ts) {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + vista.x, h / 2 + vista.y);
      ctx.scale(vista.k, vista.k);

      var foco = sel || hover;
      var visibles = foco ? vecinos[foco.id] || {} : null;
      if (resalte) { visibles = null; }

      // enlaces
      enlaces.forEach(function (e) {
        var a = porId[e.source], b = porId[e.target];
        if (!a || !b) return;
        var toca = foco && (e.source === foco.id || e.target === foco.id);
        var apagado = resalte ? !resalte.enlaces[e.id] : (foco && !toca);
        if (resalte && resalte.enlaces[e.id]) { toca = true; }
        ctx.globalAlpha = apagado ? 0.05 : (e.kind === 'relacion' ? 0.55 : 0.16);
        ctx.strokeStyle = e.kind === 'relacion' ? colores.acc : colores.linea2;
        ctx.lineWidth = e.kind === 'relacion' ? 0.6 + (e.peso || 0.5) * 1.6 : 0.6;
        ctx.setLineDash(e.kind === 'cita' ? [3, 5] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      ctx.setLineDash([]);

      // nodos
      nodos.forEach(function (n) {
        var r = radioDe(n);
        var apagado = resalte ? !resalte.nodos[n.id]
          : (foco && n !== foco && !(visibles && visibles[n.id]));
        ctx.globalAlpha = apagado ? 0.13 : 1;
        var vivo = n.kind === 'entidad';           // Coral: inteligencia viva
        var esFrame = !vivo;
        ctx.strokeStyle = vivo ? colores.acc : (n.kind === 'nucleo' || n.kind === 'producto'
                          ? colores.acc : colores.linea2);
        ctx.fillStyle = vivo ? conAlfa(colores.acc, 0.16) : 'rgba(0,0,0,0)';
        ctx.lineWidth = n === foco ? 2 : 1.1;

        ctx.beginPath();
        if (n.kind === 'artefacto' || n.kind === 'fragmento') {
          ctx.rect(n.x - r, n.y - r, r * 2, r * 2);   // Frame: documental
        } else if (n.kind === 'pedimento') {
          ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y);
          ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y); ctx.closePath();
        } else {
          ctx.arc(n.x, n.y, r, 0, 6.283);
        }
        if (vivo) ctx.fill();
        ctx.stroke();
        if (n.kind === 'nucleo') {
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.4, 0, 6.283);
          ctx.fillStyle = colores.acc; ctx.fill();
        }
        // selección: anillo punteado giratorio (quieto bajo reduced-motion)
        if (n === sel) {
          ctx.save();
          ctx.strokeStyle = colores.acc; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
          ctx.lineDashOffset = reduce ? 0 : -(ts || 0) / 60;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 7, 0, 6.283); ctx.stroke();
          ctx.restore();
        }
        // etiquetas con LOD: siempre las estructurales, el resto al acercarse
        var conEtiqueta = ['nucleo', 'pedimento', 'marca', 'pais', 'producto'].indexOf(n.kind) >= 0
          || n === foco || (visibles && visibles[n.id]) || (resalte && resalte.nodos[n.id])
          || (vista.k > 1.6 && n.kind !== 'fragmento') || (n.grado || 0) >= 6;
        if (conEtiqueta && !apagado) {
          ctx.font = (10 / Math.max(vista.k, 1)) + 'px "JetBrains Mono", monospace';
          ctx.fillStyle = n === foco ? colores.t1 : colores.t3;
          ctx.textAlign = 'center';
          ctx.fillText(n.etiqueta.slice(0, 26), n.x, n.y + r + 11 / Math.max(vista.k, 1));
        }
      });
      ctx.restore();

      // brackets de esquina (chasis del instrumento)
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
      [[8, 8, 22, 8, 8, 22], [w - 8, 8, w - 22, 8, w - 8, 22],
       [8, h - 8, 22, h - 8, 8, h - 22], [w - 8, h - 8, w - 22, h - 8, w - 8, h - 22]]
        .forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[4], c[5]); ctx.stroke();
        });
      ctx.globalAlpha = 1;
    }

    // ── gestos ───────────────────────────────────────────────────────
    var arrastre = { nodo: null, panX: 0, panY: 0, activo: false, movido: false };
    var punteros = {};

    function aMundo(px, py) {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      return [(px - w / 2 - vista.x) / vista.k, (py - h / 2 - vista.y) / vista.k];
    }
    function nodoEn(px, py) {
      var m = aMundo(px, py), mejor = null, mejorD = 1e9;
      nodos.forEach(function (n) {
        var dx = n.x - m[0], dy = n.y - m[1], d = dx * dx + dy * dy;
        var alcance = Math.max(radioDe(n) + 6, 12 / vista.k);
        if (d < alcance * alcance && d < mejorD) { mejor = n; mejorD = d; }
      });
      return mejor;
    }
    function xy(ev) {
      var caja = canvas.getBoundingClientRect();
      return [ev.clientX - caja.left, ev.clientY - caja.top];
    }

    canvas.addEventListener('pointerdown', function (ev) {
      canvas.setPointerCapture(ev.pointerId);
      punteros[ev.pointerId] = xy(ev);
      if (Object.keys(punteros).length > 1) return;   // pinch toma el control
      var p = xy(ev);
      arrastre.activo = true; arrastre.movido = false;
      arrastre.nodo = nodoEn(p[0], p[1]);
      arrastre.panX = p[0]; arrastre.panY = p[1];
      if (arrastre.nodo && sim) { sim.alfa(Math.max(sim.alfa(), 0.25)); if (!reduce) animar(); }
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (punteros[ev.pointerId]) punteros[ev.pointerId] = xy(ev);
      var ids = Object.keys(punteros);
      if (ids.length === 2) {                          // pinch
        var a = punteros[ids[0]], b = punteros[ids[1]];
        var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (arrastre.pinchD) {
          var factor = d / arrastre.pinchD;
          vista.k = Math.min(6, Math.max(0.25, vista.k * factor));
        }
        arrastre.pinchD = d;
        if (!animando) dibujar(0);
        return;
      }
      if (!arrastre.activo) {
        var p0 = xy(ev);
        var h0 = nodoEn(p0[0], p0[1]);
        if (h0 !== hover) { hover = h0; canvas.style.cursor = h0 ? 'pointer' : 'grab'; if (!animando) dibujar(0); }
        return;
      }
      var p = xy(ev);
      var dx = p[0] - arrastre.panX, dy = p[1] - arrastre.panY;
      if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movido = true;
      if (arrastre.nodo) {
        var m = aMundo(p[0], p[1]);
        arrastre.nodo.fx = m[0]; arrastre.nodo.fy = m[1];
        if (reduce) { sim && sim.correr(2); dibujar(0); }
      } else {
        vista.x += dx; vista.y += dy;
        arrastre.panX = p[0]; arrastre.panY = p[1];
        if (!animando) dibujar(0);
      }
    });
    function soltar(ev) {
      delete punteros[ev.pointerId];
      arrastre.pinchD = null;
      if (!arrastre.activo) return;
      if (!arrastre.movido) {                          // tap: seleccionar
        var p = xy(ev);
        sel = nodoEn(p[0], p[1]);
        pintarInspector(sel);
        if (!animando) dibujar(0);
      }
      if (arrastre.nodo) { arrastre.nodo.fx = null; arrastre.nodo.fy = null; }
      arrastre.activo = false; arrastre.nodo = null;
    }
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var factor = Math.pow(1.0015, -ev.deltaY);
      var p = xy(ev);
      var antes = aMundo(p[0], p[1]);
      vista.k = Math.min(6, Math.max(0.25, vista.k * factor));
      var despues = aMundo(p[0], p[1]);
      vista.x += (despues[0] - antes[0]) * vista.k;
      vista.y += (despues[1] - antes[1]) * vista.k;
      if (!animando) dibujar(0);
    }, { passive: false });

    // ── inspector ────────────────────────────────────────────────────
    function pintarInspector(n) {
      if (!inspector) return;
      if (!n) {
        inspector.innerHTML = '<p class="gr-vacio">Toca un nodo para abrir su expediente.</p>';
        return;
      }
      var extra = n.extra || {};
      var filas = Object.keys(extra)
        .filter(function (k) { return extra[k] != null && extra[k] !== '' && k !== 'virtual'; })
        .map(function (k) { return '<div class="gr-fila"><span>' + k + '</span><b>' + extra[k] + '</b></div>'; })
        .join('');
      inspector.innerHTML =
        '<div class="gr-kind">' + n.kind.toUpperCase() + (n.tipo ? ' · ' + n.tipo : '') +
        (extra.virtual ? ' · VIRTUAL' : '') + '</div>' +
        '<div class="gr-nombre">' + n.etiqueta + '</div>' +
        '<div class="gr-fila"><span>conexiones</span><b>' + (n.grado || 0) + '</b></div>' + filas;
    }

    // ── controles externos ──────────────────────────────────────────
    var buscar = q(cont.getAttribute('data-buscar'));
    if (buscar) {
      buscar.addEventListener('change', function () {
        var q = buscar.value.trim().toLowerCase();
        if (!q) return;
        var n = nodos.find(function (x) { return x.etiqueta.toLowerCase().indexOf(q) >= 0; });
        if (n) {
          sel = n; pintarInspector(n);
          vista.k = 1.8; vista.x = -n.x * vista.k; vista.y = -n.y * vista.k;
          if (!animando) dibujar(0);
        }
      });
    }
    var reset = q(cont.getAttribute('data-reset'));
    if (reset) {
      reset.addEventListener('click', function () {
        vista = { x: 0, y: 0, k: 1 }; sel = null; pintarInspector(null);
        if (!animando) dibujar(0);
      });
    }
    var cap = q(cont.getAttribute('data-cap'));
    if (cap) cap.addEventListener('change', function () { cargar(cap.value || null); });

    // API para vistas que cabalgan el lienzo (Vínculos)
    cont.grafoAPI = {
      nodos: function () { return nodos; },
      resaltar: function (idsNodos, idsEnlaces) {
        var rn = {}, re = {};
        (idsNodos || []).forEach(function (i) { rn[i] = true; });
        (idsEnlaces || []).forEach(function (i) { re[i] = true; });
        resalte = { nodos: rn, enlaces: re };
        if (!animando) dibujar(0);
      },
      limpiar: function () { resalte = null; sel = null; pintarInspector(null); if (!animando) dibujar(0); },
      enfocar: function (id) {
        var n = porId[id];
        if (!n) return;
        sel = n; pintarInspector(n);
        vista.k = Math.max(vista.k, 1.4);
        vista.x = -n.x * vista.k; vista.y = -n.y * vista.k;
        if (!animando) dibujar(0);
      }
    };

    leerColores();
    tamano();
    window.addEventListener('resize', function () { tamano(); if (!animando) dibujar(0); });
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); if (!animando) dibujar(0); }, 60);
    });
    cargar(cap && cap.value ? cap.value : 150);
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.gr-lienzo').forEach(montar);
  });
})();
