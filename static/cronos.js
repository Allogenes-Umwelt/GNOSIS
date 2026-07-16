/* GNOSIS · CRONOS (F13, CRN-05) — time travel del sustrato.
   Izquierda: los momentos de la bitácora WORM, navegables. Derecha: los
   ESTRATOS — la acumulación real de cada capa del sustrato momento a
   momento, como bandas geológicas apiladas — con la línea de
   reconstrucción; tocar un punto reconstruye ese instante vía
   /cronos/estado (conteos + resumen estructural, todo del motor).
   Reconstrucción aditiva declarada: lo borrado no resucita. CERO snake
   oil. Datos: /api/v1/autogenes/cronos{,/estado}. */
(function () {
  'use strict';

  var CAPAS = [
    { clave: 'artefactos', nombre: 'FUENTES' },
    { clave: 'fragmentos', nombre: 'FRAGMENTOS' },
    { clave: 'entidades', nombre: 'ENTIDADES' },
    { clave: 'relaciones', nombre: 'VÍNCULOS' },
    { clave: 'productos', nombre: 'PRODUCTOS' }
  ];
  var MARGEN = 34;

  document.addEventListener('DOMContentLoaded', function () {
    var elLista = document.getElementById('cr-momentos-lista');
    var elDetalle = document.getElementById('cr-detalle');
    var lienzo = document.getElementById('cr-lienzo');
    var canvas = lienzo && lienzo.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');
    var datos = null;
    var activo = -1;             // índice de momento; -1 = presente
    var colores = {};
    var reqSeq = 0;

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
        acc: cs.getPropertyValue('--acc-solid').trim() || '#00D4FF',
        accText: cs.getPropertyValue('--acc-text').trim() || '#7FE7FF',
        danger: cs.getPropertyValue('--danger').trim() || '#FF2E88',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#999',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        mono: cs.getPropertyValue('--font-mono').trim() || 'monospace'
      };
    }
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = caja.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── los estratos: bandas acumuladas apiladas ─────────────────────
    function dibujar() {
      if (!ctx || !datos) return;
      leerColores();
      tamano();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      var pts = datos.puntos;
      if (!pts.length) {
        ctx.fillStyle = colores.t3;
        ctx.font = '11px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('SIN MUTACIONES — LA HISTORIA NACE CON LA PRIMERA', w / 2, h / 2);
        return;
      }
      var n = pts.length;
      var maxTotal = 1;
      pts.forEach(function (p) {
        var t = CAPAS.reduce(function (s, c) { return s + p.capas[c.clave]; }, 0);
        if (t > maxTotal) maxTotal = t;
      });
      function X(i) {
        return n === 1 ? w / 2
          : MARGEN + (i / (n - 1)) * (w - MARGEN * 2);
      }
      var alto = h - MARGEN * 2;

      // las bandas, de abajo hacia arriba, tintas del acento escalonadas
      var tintas = [0.5, 0.4, 0.85, 0.65, 0.25];
      var base = pts.map(function () { return h - MARGEN; });
      CAPAS.forEach(function (capa, ci) {
        ctx.beginPath();
        pts.forEach(function (p, i) {
          var y = base[i] - (p.capas[capa.clave] / maxTotal) * alto;
          if (i === 0) ctx.moveTo(X(0), base[0]);
          ctx.lineTo(X(i), y);
        });
        for (var i = n - 1; i >= 0; i--) ctx.lineTo(X(i), base[i]);
        ctx.closePath();
        ctx.fillStyle = alfa(colores.acc, 0.10 + ci * 0.07);
        ctx.fill();
        ctx.strokeStyle = alfa(colores.acc, tintas[ci]);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.lineWidth = 1;
        pts.forEach(function (p, i) {
          base[i] -= (p.capas[capa.clave] / maxTotal) * alto;
        });
        // rótulo de la capa al borde derecho, sobre su banda final
        var yFin = base[n - 1];
        ctx.fillStyle = alfa(colores.accText, 0.95);
        ctx.font = '9px ' + colores.mono;
        ctx.textAlign = 'right';
        ctx.fillText(capa.nombre + ' ' + pts[n - 1].capas[capa.clave],
                     w - 4, yFin + 10);
      });

      // línea de reconstrucción (el instante elegido)
      if (activo >= 0 && activo < n) {
        var x = X(activo);
        ctx.strokeStyle = colores.danger;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x, MARGEN * 0.6);
        ctx.lineTo(x, h - MARGEN + 8);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.fillStyle = colores.danger;
        ctx.font = '9px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText(String(pts[activo].ts).slice(0, 16), x, MARGEN * 0.6 - 4);
      }
      // eje temporal
      ctx.fillStyle = colores.t3;
      ctx.font = '9px ' + colores.mono;
      ctx.textAlign = 'left';
      ctx.fillText(String(pts[0].ts).slice(0, 10), MARGEN, h - 8);
      ctx.textAlign = 'right';
      ctx.fillText(String(pts[n - 1].ts).slice(0, 10), w - MARGEN, h - 8);
    }

    // ── reconstrucción del instante ──────────────────────────────────
    function reconstruir(i) {
      activo = i;
      pintarMomentos();
      dibujar();
      var ts = i >= 0 ? datos.puntos[i].ts : null;
      var mi = ++reqSeq;
      elDetalle.innerHTML = '<p class="qa-base-hint">Reconstruyendo…</p>';
      fetch('/api/v1/autogenes/cronos/estado' +
            (ts ? '?ts=' + encodeURIComponent(ts) : ''))
        .then(function (r) { return r.json(); })
        .then(function (e) {
          if (mi !== reqSeq || !e || e.error) return;
          var rs = e.resumen;
          var html = '<div class="cn-ficha-monto" style="color:var(--acc-text)">' +
            (ts ? esc(String(ts).slice(0, 16)) : 'presente') + '</div>' +
            '<div class="qa-lista">' +
            '<div class="cn-ref"><span>' + e.acciones_hasta +
            ' mutaciones registradas hasta este instante</span></div>' +
            '<div class="cn-ref"><span>red del sustrato: <b>' + rs.n_nodos +
            '</b> nodos · <b>' + rs.n_enlaces + '</b> vínculos · <b>' +
            rs.n_comunidades + '</b> comunidades · <b>' + rs.n_componentes +
            '</b> islas</span></div>';
          CAPAS.forEach(function (c) {
            html += '<div class="cn-ref"><span>' + c.nombre.toLowerCase() +
              ' <b>' + e.capas[c.clave] + '</b></span></div>';
          });
          if (rs.puentes.length) {
            html += '<div class="cn-ref"><span>puentes: <b>' +
              rs.puentes.map(function (p) { return esc(p.etiqueta); })
                .join('</b>, <b>') + '</b></span></div>';
          }
          elDetalle.innerHTML = html + '</div>';
        })
        .catch(function () {
          elDetalle.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
        });
    }

    function pintarMomentos() {
      var html = '';
      datos.puntos.forEach(function (p, i) {
        html += '<button type="button" class="sn-celda' +
          (i === activo ? ' activo' : '') + '" data-i="' + i + '">' +
          '<span>' + esc(String(p.ts).slice(0, 16)) + ' · ' +
          esc(p.accion) + ' — ' + esc(p.detalle) + '</span></button>';
      });
      if (datos.recortado) {
        html += '<p class="qa-base-hint">Mostrando los primeros ' +
          datos.puntos.length + ' de ' + datos.total_momentos +
          ' momentos — el conteo total SÍ los incluye.</p>';
      }
      elLista.innerHTML = html;
      elLista.querySelectorAll('.sn-celda').forEach(function (btn) {
        btn.addEventListener('click', function () {
          reconstruir(Number(btn.dataset.i));
        });
      });
    }

    if (canvas) {
      canvas.addEventListener('click', function (ev) {
        if (!datos || !datos.puntos.length) return;
        var caja = canvas.getBoundingClientRect();
        var n = datos.puntos.length;
        var frac = (ev.clientX - caja.left - MARGEN) /
                   Math.max(1, caja.width - MARGEN * 2);
        var i = Math.round(frac * (n - 1));
        reconstruir(Math.max(0, Math.min(n - 1, i)));
      });
      window.addEventListener('resize', dibujar);
      var alternador = document.getElementById('theme-toggle');
      if (alternador) alternador.addEventListener('click', function () {
        setTimeout(dibujar, 60);
      });
    }

    fetch('/api/v1/autogenes/cronos')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elLista.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        datos = j;
        document.getElementById('cr-momentos').textContent = j.total_momentos;
        var fin = j.puntos.length ? j.puntos[j.puntos.length - 1].capas : null;
        document.getElementById('cr-artefactos').textContent =
          fin ? fin.artefactos : '0';
        document.getElementById('cr-entidades').textContent =
          fin ? fin.entidades : '0';
        document.getElementById('cr-enlaces').textContent =
          fin ? fin.relaciones : '0';
        pintarMomentos();
        dibujar();
        reconstruir(-1);          // el presente, honesto por defecto
      })
      .catch(function () {
        elLista.innerHTML = '<p class="qa-base-hint">Sin conexión con el sustrato.</p>';
      });
  });
})();
