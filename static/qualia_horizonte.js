/* GNOSIS · Qualia — Horizonte de eventos (F7d, port de LienzoHorizonte).
   Osciloscopio longitudinal sobre la telemetría PROPIA del operador: las
   ondas son las métricas muestreadas (conceptos y vínculos, cada una
   normalizada a su máximo) dibujadas como puntos unidos por línea fina —
   puntos porque ESO son: nada entre muestras se inventa. Las líneas
   verticales en cian son las intervenciones del operador desde la
   bitácora WORM; tocar una revela su delta MEDIDO entre las muestras que
   la flanquean (null honesto si aún no hay muestra posterior). La
   scanline es cromo puro: se omite bajo prefers-reduced-motion y se
   pausa con la pestaña oculta — jamás porta información.
   Datos: /api/v1/autogenes/qualia/horizonte. */
(function () {
  'use strict';

  var MARGEN = 34;

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qh-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    var elInfo = document.getElementById('qh-info');
    var elDetalle = document.getElementById('qh-detalle');
    var elSpec = document.getElementById('qh-spec');
    var elLineas = document.getElementById('qh-lineas');

    var colores = {};
    var horizonte = null;
    var motivo = null;
    var seleccionada = null;     // índice de línea
    var posLineas = [];          // x en pantalla por línea
    var fase = 0;
    var animando = false;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function alfa(hex, a) {
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
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA'
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
    // SQLite entrega 'YYYY-MM-DD HH:MM:SS' en UTC: a época para el eje.
    function epoca(ts) {
      return Date.parse(String(ts).replace(' ', 'T') + 'Z');
    }
    function fechaCorta(ts) {
      return String(ts).slice(0, 16);
    }

    function dibujar() {
      if (!horizonte) return;
      tamano();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var puntos = horizonte.puntos, lineas = horizonte.lineas;
      var t0 = epoca(horizonte.t0), t1 = epoca(horizonte.t1);
      var ancho = Math.max(t1 - t0, 1);
      function X(ts) { return MARGEN + ((epoca(ts) - t0) / ancho) * (w - MARGEN * 2); }
      function Y(v, max) { return h - MARGEN - (v / max) * (h - MARGEN * 2); }

      ctx.clearRect(0, 0, w, h);

      // retícula sutil
      ctx.strokeStyle = alfa(colores.linea, 0.18);
      ctx.lineWidth = 1;
      for (var gy = MARGEN; gy <= h - MARGEN; gy += (h - MARGEN * 2) / 4) {
        ctx.beginPath(); ctx.moveTo(MARGEN, gy); ctx.lineTo(w - MARGEN, gy); ctx.stroke();
      }

      // trazas: conceptos (tinta fuerte) y vínculos (tinta media),
      // cada una normalizada a su propio máximo
      var trazas = [
        { v: function (p) { return p.n_nodos; }, max: horizonte.max_nodos, tinta: colores.t1 },
        { v: function (p) { return p.n_enlaces; }, max: horizonte.max_enlaces, tinta: colores.t3 }
      ];
      trazas.forEach(function (t) {
        ctx.beginPath();
        puntos.forEach(function (p, i) {
          var px = X(p.ts), py = Y(t.v(p), t.max);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = alfa(t.tinta, 0.7);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        puntos.forEach(function (p) {
          ctx.beginPath();
          ctx.arc(X(p.ts), Y(t.v(p), t.max), 2.5, 0, 6.283);
          ctx.fillStyle = t.tinta;
          ctx.fill();
        });
      });

      // líneas de intervención: las marcas del operador sobre el tiempo
      posLineas = [];
      lineas.forEach(function (linea, i) {
        var px = X(linea.ts);
        posLineas.push({ x: px, i: i });
        var esSel = seleccionada === i;
        ctx.beginPath();
        ctx.moveTo(px, MARGEN - 6); ctx.lineTo(px, h - MARGEN + 6);
        ctx.strokeStyle = alfa(colores.acc, esSel ? 0.95 : 0.45);
        ctx.lineWidth = esSel ? 1.8 : 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 3, MARGEN - 6); ctx.lineTo(px + 3, MARGEN - 6);
        ctx.strokeStyle = alfa(colores.acc, esSel ? 1 : 0.6);
        ctx.stroke();
      });

      // scanline: cromo puro (omitida bajo reduced-motion)
      if (!reduce && !document.hidden) {
        fase = (fase + 0.0035) % 1;
        var sx = MARGEN + fase * (w - MARGEN * 2);
        var grad = ctx.createLinearGradient(sx - 14, 0, sx, 0);
        grad.addColorStop(0, alfa(colores.acc, 0));
        grad.addColorStop(1, alfa(colores.acc, 0.1));
        ctx.fillStyle = grad;
        ctx.fillRect(sx - 14, MARGEN, 14, h - MARGEN * 2);
      }

      // leyenda + cotas de tiempo, honestas y en mono
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = colores.t1;
      ctx.fillText('● conceptos', MARGEN, 10);
      ctx.fillStyle = colores.t3;
      ctx.fillText('● vínculos', MARGEN + 78, 10);
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = alfa(colores.t3, 0.9);
      ctx.fillText(fechaCorta(horizonte.t0), MARGEN, h - 8);
      ctx.textAlign = 'right';
      ctx.fillText(fechaCorta(horizonte.t1), w - MARGEN, h - 8);

      // brackets de esquina
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
      [[8, 8, 22, 8, 8, 22], [w - 8, 8, w - 22, 8, w - 8, 22],
       [8, h - 8, 22, h - 8, 8, h - 22], [w - 8, h - 8, w - 22, h - 8, w - 8, h - 22]]
        .forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[4], c[5]); ctx.stroke();
        });
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }

    function animar() {
      // el rAF existe SOLO por la scanline de cromo
      if (reduce || animando || !horizonte) return;
      animando = true;
      (function paso() {
        if (document.hidden) { animando = false; return; }
        dibujar();
        requestAnimationFrame(paso);
      })();
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && horizonte) animar();
    });

    // ── ficha ────────────────────────────────────────────────────────
    function signo(n) { return n > 0 ? '+' + n : String(n); }
    function pintarDetalle(linea) {
      if (!linea) {
        elDetalle.innerHTML = '<p class="qa-base-hint">Toca una línea vertical ' +
          'para ver la intervención y su delta medido entre las muestras que ' +
          'la flanquean.</p>';
        return;
      }
      var delta = linea.delta === null
        ? '<p class="qa-base-hint">Sin muestra posterior todavía — el delta se ' +
          'medirá cuando exista, no se interpola.</p>'
        : '<p class="qa-lectura">Delta medido: <b>' + signo(linea.delta.nodos) +
          ' conceptos</b>, <b>' + signo(linea.delta.enlaces) + ' vínculos</b> ' +
          'entre las muestras que flanquean la intervención.</p>';
      elDetalle.innerHTML =
        '<div class="gr-kind">' + esc(linea.accion.toUpperCase()) + ' · ' +
        esc(fechaCorta(linea.ts)) + '</div>' +
        '<div class="gr-nombre">' + esc(linea.detalle) + '</div>' + delta;
    }
    function pintarFicha() {
      elSpec.innerHTML =
        '<div class="qa-bar"><span class="l">muestras</span><span class="v">' +
        horizonte.puntos.length + '</span></div>' +
        '<div class="qa-bar"><span class="l">intervenciones</span><span class="v">' +
        horizonte.lineas.length + '</span></div>' +
        '<div class="qa-bar"><span class="l">máx conceptos</span><span class="v">' +
        horizonte.max_nodos + '</span></div>' +
        '<div class="qa-bar"><span class="l">máx vínculos</span><span class="v">' +
        horizonte.max_enlaces + '</span></div>';
      var html = '';
      horizonte.lineas.forEach(function (l, i) {
        html += '<button type="button" class="qa-caja qa-item' +
          (seleccionada === i ? ' activo' : '') + '" data-i="' + i + '">' +
          '<span title="' + esc(l.detalle) + '">' + esc(l.accion) + ' · ' +
          esc(l.detalle.slice(0, 22)) + '</span><b>' +
          (l.delta ? signo(l.delta.nodos) + '/' + signo(l.delta.enlaces) : '—') +
          '</b></button>';
      });
      elLineas.innerHTML = html ||
        '<p class="qa-base-hint">Sin intervenciones dentro de la ventana muestreada.</p>';
      elLineas.querySelectorAll('.qa-item').forEach(function (b) {
        b.addEventListener('click', function () {
          seleccionar(parseInt(b.getAttribute('data-i'), 10));
        });
      });
    }
    function seleccionar(i) {
      seleccionada = seleccionada === i ? null : i;
      pintarDetalle(seleccionada === null ? null : horizonte.lineas[seleccionada]);
      pintarFicha();
      if (!animando) dibujar();
    }

    // ── datos ────────────────────────────────────────────────────────
    function cargar() {
      fetch('/api/v1/autogenes/qualia/horizonte')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) {
            elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase();
            return;
          }
          horizonte = j.horizonte;
          motivo = j.motivo || null;
          if (!horizonte) {
            elInfo.textContent = (motivo || 'SIN TELEMETRÍA AÚN').toUpperCase();
            elSpec.innerHTML = '';
            elLineas.innerHTML = '<p class="qa-base-hint">' +
              esc(motivo || 'La telemetría nace con la primera mutación del grafo.') +
              '</p>';
            return;
          }
          elInfo.textContent = horizonte.puntos.length + ' MUESTRAS · ' +
            horizonte.lineas.length + ' INTERVENCIONES · NADA ENTRE MUESTRAS SE INVENTA';
          pintarFicha();
          dibujar();
          animar();
        })
        .catch(function () {
          elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
        });
    }

    canvas.addEventListener('pointerup', function (ev) {
      if (!horizonte) return;
      var caja = canvas.getBoundingClientRect();
      var sx = ev.clientX - caja.left;
      var mejor = null, mejorD = 18;
      posLineas.forEach(function (p) {
        var d = Math.abs(p.x - sx);
        if (d < mejorD) { mejorD = d; mejor = p.i; }
      });
      seleccionar(mejor);
    });

    leerColores();
    tamano();
    window.addEventListener('resize', function () { if (!animando) dibujar(); });
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); if (!animando) dibujar(); }, 60);
    });
    cargar();
  });
})();
