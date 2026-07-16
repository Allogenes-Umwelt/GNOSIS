/* GNOSIS · TBV-01 MADURACIÓN — espectro de días importación→venta.
   Izquierda: marcas por mediana con sus unidades más lentas citadas.
   Derecha: por marca una franja donde CADA unidad real es un trazo en
   su día exacto (la saturación es acumulación real), con P25/mediana/
   P90 del motor. Toggle de marca (todas / una) como pidió el acuerdo.
   CERO snake oil: sin fechas parseables se declara; venta antes de
   importar se reporta como anomalía. Datos: /api/v1/tableros/maduracion. */
(function () {
  'use strict';

  var MARGEN = { izq: 96, der: 24, arr: 22, aba: 30 };

  document.addEventListener('DOMContentLoaded', function () {
    var elMarcas = document.getElementById('tm-marcas');
    var elDetalle = document.getElementById('tm-detalle');
    var elToggle = document.getElementById('tm-toggle');
    var lienzo = document.getElementById('tm-lienzo');
    var canvas = lienzo && lienzo.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');
    var datos = null;
    var marcaActiva = null;         // null = todas
    var colores = {};

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function num(n) { return n == null ? '—' : Number(n).toLocaleString('es-MX'); }
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
    function visibles() {
      return marcaActiva
        ? datos.marcas.filter(function (m) { return m.marca === marcaActiva; })
        : datos.marcas;
    }

    function dibujar() {
      if (!ctx || !datos) return;
      leerColores();
      tamano();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      var vis = visibles();
      if (!vis.length || !datos.max_dias) {
        ctx.fillStyle = colores.t3;
        ctx.font = '11px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('SIN PARES DE FECHAS — EL ESPECTRO NACE CON PEDIMENTO Y FACTURA',
                     w / 2, h / 2);
        return;
      }
      var maxD = datos.max_dias;
      function X(d) {
        return MARGEN.izq + (d / maxD) * (w - MARGEN.izq - MARGEN.der);
      }
      var paso = (h - MARGEN.arr - MARGEN.aba) / vis.length;
      var altoFranja = Math.min(44, paso * 0.62);

      // eje de días
      ctx.font = '9px ' + colores.mono;
      ctx.fillStyle = colores.t3;
      for (var d = 0; d <= maxD; d += Math.max(1, Math.ceil(maxD / 6))) {
        ctx.textAlign = 'center';
        ctx.fillText(d + 'd', X(d), h - 10);
        ctx.strokeStyle = alfa(colores.linea, 0.2);
        ctx.beginPath();
        ctx.moveTo(X(d), MARGEN.arr);
        ctx.lineTo(X(d), h - MARGEN.aba);
        ctx.stroke();
      }

      vis.forEach(function (m, i) {
        var yC = MARGEN.arr + paso * i + paso / 2;
        var y0 = yC - altoFranja / 2, y1 = yC + altoFranja / 2;
        // cada unidad un trazo: la saturación ES acumulación real
        ctx.strokeStyle = alfa(colores.acc, 0.30);
        m.deltas.forEach(function (dd) {
          ctx.beginPath();
          ctx.moveTo(X(dd), y0);
          ctx.lineTo(X(dd), y1);
          ctx.stroke();
        });
        // percentiles del motor
        [[m.p25, 0.6, 1], [m.mediana, 1.0, 2], [m.p90, 0.6, 1]]
          .forEach(function (pc) {
            ctx.strokeStyle = alfa(colores.accText, pc[1]);
            ctx.lineWidth = pc[2];
            ctx.beginPath();
            ctx.moveTo(X(pc[0]), y0 - 5);
            ctx.lineTo(X(pc[0]), y1 + 5);
            ctx.stroke();
            ctx.lineWidth = 1;
          });
        ctx.fillStyle = colores.t1;
        ctx.font = '700 10px ' + colores.mono;
        ctx.textAlign = 'right';
        ctx.fillText(m.marca, MARGEN.izq - 10, yC - 2);
        ctx.fillStyle = colores.t3;
        ctx.font = '9px ' + colores.mono;
        ctx.fillText(m.n + ' uds · med ' + m.mediana + 'd',
                     MARGEN.izq - 10, yC + 10);
        if (m.recorte) {
          ctx.fillStyle = colores.t3;
          ctx.textAlign = 'left';
          ctx.fillText('+' + m.recorte + ' trazos más (los cortes SÍ los incluyen)',
                       MARGEN.izq, y1 + 12);
        }
      });
    }

    function pintarToggle() {
      var html = '<button type="button" data-marca=""' +
        (marcaActiva ? '' : ' class="activo"') + '>todas</button>';
      datos.marcas.forEach(function (m) {
        html += '<button type="button" data-marca="' + esc(m.marca) + '"' +
          (marcaActiva === m.marca ? ' class="activo"' : '') + '>' +
          esc(m.marca.toLowerCase()) + '</button>';
      });
      elToggle.innerHTML = html;
      elToggle.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          marcaActiva = b.dataset.marca || null;
          pintarToggle();
          pintarMarcas();
          pintarDetalle();
          dibujar();
        });
      });
    }

    function pintarMarcas() {
      if (!datos.marcas.length) {
        elMarcas.innerHTML = '<p class="qa-base-hint">Sin pares de fechas ' +
          'medibles en la sesión.</p>';
        return;
      }
      var html = '';
      datos.marcas.forEach(function (m) {
        html += '<button type="button" class="cn-caja qa-item' +
          (m.marca === marcaActiva ? ' activo' : '') + '" data-marca="' +
          esc(m.marca) + '" style="border-left-color:var(--acc-solid)">' +
          '<span class="fila"><span class="titulo">' + esc(m.marca) + '</span>' +
          '<span class="monto" style="color:var(--acc-text)">med ' +
          m.mediana + 'd</span></span>' +
          '<p class="detalle">' + num(m.n) + ' unidades · P25 ' + m.p25 +
          'd · P90 ' + m.p90 + 'd · rango ' + m.min + '–' + m.max +
          'd</p></button>';
      });
      elMarcas.innerHTML = html;
      elMarcas.querySelectorAll('.cn-caja').forEach(function (btn) {
        btn.addEventListener('click', function () {
          marcaActiva = marcaActiva === btn.dataset.marca ? null : btn.dataset.marca;
          pintarToggle();
          pintarMarcas();
          pintarDetalle();
          dibujar();
        });
      });
    }

    function pintarDetalle() {
      if (!marcaActiva) { elDetalle.innerHTML = ''; return; }
      var m = datos.marcas.find(function (x) { return x.marca === marcaActiva; });
      if (!m) { elDetalle.innerHTML = ''; return; }
      var html = '<div class="qa-sec">' + esc(m.marca) +
        ' · las más lentas</div><div class="qa-lista">';
      m.extremos.forEach(function (u) {
        html += '<div class="cn-ref"><span><b>' + u.dias + ' días</b> · chasis <b>' +
          esc(u.chasis || 's/n') + '</b> · factura <b>' + esc(u.factura || 's/n') +
          '</b></span></div>';
      });
      elDetalle.innerHTML = html + '</div>';
    }

    if (canvas) {
      window.addEventListener('resize', dibujar);
      var alternador = document.getElementById('theme-toggle');
      if (alternador) alternador.addEventListener('click', function () {
        setTimeout(dibujar, 60);
      });
    }

    fetch('/api/v1/tableros/maduracion')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elMarcas.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        datos = j;
        document.getElementById('tm-medidas').textContent = num(j.medidas);
        // mediana global honesta: rango más cercano sobre TODAS las medidas
        var todos = [];
        j.marcas.forEach(function (m) { todos = todos.concat(m.deltas); });
        todos.sort(function (a, b) { return a - b; });
        document.getElementById('tm-mediana').textContent = todos.length
          ? todos[Math.round(0.5 * (todos.length - 1))] + 'd' : '—';
        var sf = document.getElementById('tm-sinfechas');
        sf.textContent = num(j.sin_fechas);
        sf.classList.toggle('riesgo', j.sin_fechas > 0);
        var ng = document.getElementById('tm-negativos');
        ng.textContent = num(j.negativos);
        ng.classList.toggle('riesgo', j.negativos > 0);
        pintarToggle();
        pintarMarcas();
        dibujar();
      })
      .catch(function () {
        elMarcas.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
      });
  });
})();
