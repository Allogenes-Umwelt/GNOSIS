/* GNOSIS · TBV-05 CUPO — cascada de agotamiento, pasado y presente.
   Cada mes un escalón del libro mayor: disponible al inicio, el consumo
   como caída conectada, disponible al fin — TAL CUAL de
   seguimiento_mensual, sin proyección (el futuro se quitó por acuerdo
   y se declara cuántos meses se excluyeron). Un mes que toca cero va en
   magenta: es un hecho. Datos: /api/v1/tableros/cupo. */
(function () {
  'use strict';

  var MARGEN = { izq: 54, der: 20, arr: 26, aba: 34 };

  document.addEventListener('DOMContentLoaded', function () {
    var elCupos = document.getElementById('tc-cupos');
    var elMeses = document.getElementById('tc-meses');
    var elDial = document.getElementById('tc-dial');
    var lienzo = document.getElementById('tc-lienzo');
    var canvas = lienzo && lienzo.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');
    var datos = null;
    var tipoActivo = null;
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
    function serieActiva() {
      return datos.series.find(function (s) { return s.tipo === tipoActivo; });
    }

    function dibujar() {
      if (!ctx || !datos) return;
      leerColores();
      tamano();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      var serie = serieActiva();
      if (!serie || !serie.meses.length) {
        ctx.fillStyle = colores.t3;
        ctx.font = '11px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('SIN SEGUIMIENTO MENSUAL PARA ESTE CUPO', w / 2, h / 2);
        return;
      }
      var meses = serie.meses;
      var maxV = 1;
      meses.forEach(function (m) {
        maxV = Math.max(maxV, m.inicio || 0, m.fin || 0);
      });
      var zonaW = w - MARGEN.izq - MARGEN.der;
      var paso = zonaW / meses.length;
      var barW = Math.min(52, paso * 0.6);
      var alto = h - MARGEN.arr - MARGEN.aba;
      function Y(v) { return MARGEN.arr + (1 - v / maxV) * alto; }

      // retícula
      ctx.font = '9px ' + colores.mono;
      for (var g = 0; g <= 4; g++) {
        var v = Math.round((maxV / 4) * g);
        ctx.strokeStyle = alfa(colores.linea, 0.2);
        ctx.beginPath();
        ctx.moveTo(MARGEN.izq, Y(v));
        ctx.lineTo(w - MARGEN.der, Y(v));
        ctx.stroke();
        ctx.fillStyle = colores.t3;
        ctx.textAlign = 'right';
        ctx.fillText(num(v), MARGEN.izq - 6, Y(v) + 3);
      }

      var finAnterior = null;
      meses.forEach(function (m, i) {
        var x = MARGEN.izq + paso * i + (paso - barW) / 2;
        var ini = m.inicio == null ? (finAnterior == null ? 0 : finAnterior)
          : m.inicio;
        var fin = m.fin == null ? ini - m.consumo : m.fin;
        var tinta = m.agotado ? colores.danger : colores.acc;
        // el escalón: de inicio a fin — la caída ES el consumo
        ctx.fillStyle = alfa(tinta, 0.35);
        ctx.fillRect(x, Y(ini), barW, Math.max(2, Y(fin) - Y(ini)));
        ctx.strokeStyle = tinta;
        ctx.lineWidth = m.agotado ? 2 : 1.2;
        ctx.strokeRect(x, Y(ini), barW, Math.max(2, Y(fin) - Y(ini)));
        ctx.lineWidth = 1;
        // conector con el mes anterior (continuidad del libro)
        if (finAnterior != null) {
          ctx.strokeStyle = alfa(colores.t3, 0.6);
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x - (paso - barW), Y(finAnterior));
          ctx.lineTo(x, Y(ini));
          ctx.stroke();
          ctx.setLineDash([]);
        }
        finAnterior = fin;
        ctx.fillStyle = colores.t1;
        ctx.font = '700 10px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('−' + num(m.consumo), x + barW / 2, Y(ini) - 6);
        ctx.fillStyle = m.agotado ? colores.danger : colores.t3;
        ctx.font = '9px ' + colores.mono;
        ctx.fillText(esc(m.nombre).slice(0, 3).toUpperCase(),
                     x + barW / 2, h - 10);
        if (m.agotado) {
          ctx.fillStyle = colores.danger;
          ctx.fillText('AGOTADO', x + barW / 2, Y(fin) + 14);
        }
      });
    }

    function pintarDial() {
      var html = '';
      datos.series.forEach(function (s) {
        html += '<button type="button" data-tipo="' + esc(s.tipo) + '"' +
          (s.tipo === tipoActivo ? ' class="activo"' : '') + '>' +
          esc(s.tipo.toLowerCase()) + '</button>';
      });
      elDial.innerHTML = html;
      elDial.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          tipoActivo = b.dataset.tipo;
          pintarDial();
          pintarMeses();
          dibujar();
        });
      });
    }

    function pintarCupos() {
      if (!datos.cupos.length) {
        elCupos.innerHTML = '<p class="qa-base-hint">Sin autorizaciones de ' +
          'cupo en la sesión.</p>';
        return;
      }
      var html = '';
      datos.cupos.forEach(function (q) {
        var agotado = q.mes_agotado || (q.cantidad_saldo != null && q.cantidad_saldo <= 0);
        html += '<div class="cn-caja qa-item' + (agotado ? '' : ' vl-ok') + '">' +
          '<span class="clase"' + (agotado ? '' : ' style="color:var(--acc-text)"') +
          '>' + esc(q.tipo) + (agotado ? ' · agotado' : '') + '</span>' +
          '<span class="fila"><span class="titulo">' +
          esc(q.numero_autorizacion || 's/n') + '</span>' +
          '<span class="monto' + (agotado ? '' : ' neutro') + '">saldo ' +
          num(q.cantidad_saldo) + '</span></span>' +
          '<p class="detalle">inicial ' + num(q.cantidad_inicial) +
          ' · consumido ' + num(q.cantidad_consumida) +
          (q.mes_agotado ? ' · agotado en ' + esc(q.mes_agotado) : '') +
          '</p></div>';
      });
      elCupos.innerHTML = html;
    }

    function pintarMeses() {
      var serie = serieActiva();
      if (!serie) { elMeses.innerHTML = ''; return; }
      var html = '';
      serie.meses.forEach(function (m) {
        html += '<div class="cn-ref' + (m.agotado ? ' agotado' : '') + '">' +
          '<b>' + esc(m.nombre) + '</b><span>inicio ' + num(m.inicio) +
          ' · consumo ' + num(m.consumo) + ' · fin ' + num(m.fin) +
          (m.agotado ? ' · AGOTADO' : '') + '</span></div>';
      });
      if (datos.meses_futuros_excluidos) {
        html += '<p class="qa-base-hint">' + datos.meses_futuros_excluidos +
          ' meses futuros excluidos por acuerdo — sin proyecciones aquí.</p>';
      }
      elMeses.innerHTML = html;
    }

    if (canvas) {
      window.addEventListener('resize', dibujar);
      var alternador = document.getElementById('theme-toggle');
      if (alternador) alternador.addEventListener('click', function () {
        setTimeout(dibujar, 60);
      });
    }

    fetch('/api/v1/tableros/cupo')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elCupos.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        datos = j;
        tipoActivo = j.series.length ? j.series[0].tipo : null;
        document.getElementById('tc-nota').textContent = j.nota;
        pintarDial();
        pintarCupos();
        pintarMeses();
        dibujar();
      })
      .catch(function () {
        elCupos.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
      });
  });
})();
