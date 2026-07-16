/* GNOSIS · TBV-04 RECHAZOS — Pareto de razones de falla.
   Barras por razón (frecuencia real) + línea de acumulado + guía del
   80%. Tocar una barra o una razón cita sus archivos. Un error_type
   vacío se confiesa. CERO snake oil. Datos: /api/v1/tableros/rechazos. */
(function () {
  'use strict';

  var MARGEN = { izq: 44, der: 44, arr: 22, aba: 56 };

  document.addEventListener('DOMContentLoaded', function () {
    var elLista = document.getElementById('tr-lista');
    var elDetalle = document.getElementById('tr-detalle');
    var lienzo = document.getElementById('tr-lienzo');
    var canvas = lienzo && lienzo.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');
    var datos = null;
    var activo = -1;
    var barras = [];
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

    function dibujar() {
      if (!ctx || !datos) return;
      leerColores();
      tamano();
      barras = [];
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      var ps = datos.pareto;
      if (!ps.length) {
        ctx.fillStyle = colores.t3;
        ctx.font = '11px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('SIN RECHAZOS — SESIÓN LIMPIA', w / 2, h / 2);
        return;
      }
      var maxN = ps[0].n;
      var zonaW = w - MARGEN.izq - MARGEN.der;
      var paso = zonaW / ps.length;
      var barW = Math.min(64, paso * 0.66);
      var alto = h - MARGEN.arr - MARGEN.aba;

      function Ypct(p) { return MARGEN.arr + (1 - p / 100) * alto; }

      // guía del 80% (referencia, tinta neutra)
      ctx.strokeStyle = alfa(colores.t3, 0.5);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(MARGEN.izq, Ypct(80));
      ctx.lineTo(w - MARGEN.der, Ypct(80));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colores.t3;
      ctx.font = '9px ' + colores.mono;
      ctx.textAlign = 'left';
      ctx.fillText('80%', w - MARGEN.der + 6, Ypct(80) + 3);

      ps.forEach(function (p, i) {
        var x = MARGEN.izq + paso * i + (paso - barW) / 2;
        var bh = (p.n / maxN) * alto;
        var sel = i === activo;
        var tinta = p.clase === 'faltante' ? colores.danger : colores.acc;
        ctx.fillStyle = alfa(tinta, sel ? 0.85 : 0.5);
        ctx.fillRect(x, MARGEN.arr + alto - bh, barW, bh);
        ctx.strokeStyle = tinta;
        ctx.lineWidth = sel ? 2 : 1;
        ctx.strokeRect(x, MARGEN.arr + alto - bh, barW, bh);
        ctx.lineWidth = 1;
        ctx.fillStyle = colores.t1;
        ctx.font = '700 11px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText(String(p.n), x + barW / 2, MARGEN.arr + alto - bh - 6);
        // rótulo de razón, recortado
        var rot = p.razon.length > 14 ? p.razon.slice(0, 13) + '…' : p.razon;
        ctx.fillStyle = colores.t3;
        ctx.font = '9px ' + colores.mono;
        ctx.save();
        ctx.translate(x + barW / 2, h - MARGEN.aba + 12);
        ctx.rotate(-0.5);
        ctx.textAlign = 'right';
        ctx.fillText(rot, 0, 0);
        ctx.restore();
        barras.push({ x: x, y: MARGEN.arr, w: barW, h: alto, i: i });
      });

      // línea de acumulado (eje derecho 0-100%)
      ctx.strokeStyle = colores.accText;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ps.forEach(function (p, i) {
        var x = MARGEN.izq + paso * i + paso / 2;
        var y = Ypct(p.acumulado_pct);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
      ps.forEach(function (p, i) {
        var x = MARGEN.izq + paso * i + paso / 2;
        ctx.beginPath();
        ctx.arc(x, Ypct(p.acumulado_pct), 3, 0, 6.283);
        ctx.fillStyle = colores.accText;
        ctx.fill();
      });
    }

    function seleccionar(i) {
      activo = i;
      pintarLista();
      pintarDetalle();
      dibujar();
    }

    function pintarLista() {
      if (!datos.pareto.length) {
        elLista.innerHTML = '<p class="qa-base-hint">Sesión limpia — cero ' +
          'rechazos que explicar.</p>';
        return;
      }
      var html = '';
      datos.pareto.forEach(function (p, i) {
        html += '<button type="button" class="cn-caja qa-item' +
          (i === activo ? ' activo' : '') + '" data-i="' + i + '">' +
          '<span class="clase">' + esc(p.clase) + '</span>' +
          '<span class="fila"><span class="titulo">' + esc(p.razon) + '</span>' +
          '<span class="monto">' + num(p.n) + '</span></span>' +
          '<p class="detalle">' + p.pct + '% del total · acumulado ' +
          p.acumulado_pct + '%</p></button>';
      });
      elLista.innerHTML = html;
      elLista.querySelectorAll('.cn-caja').forEach(function (btn) {
        btn.addEventListener('click', function () {
          seleccionar(Number(btn.dataset.i));
        });
      });
    }

    function pintarDetalle() {
      var p = datos.pareto[activo];
      if (!p) { elDetalle.innerHTML = ''; return; }
      var html = '<div class="qa-sec">' + esc(p.razon) +
        ' · archivos</div><div class="qa-lista">';
      p.archivos.forEach(function (a) {
        html += '<div class="cn-ref"><b>' + esc(a) + '</b></div>';
      });
      if (p.recorte) {
        html += '<p class="qa-base-hint">+' + p.recorte +
          ' más — el conteo SÍ los incluye.</p>';
      }
      elDetalle.innerHTML = html + '</div>';
    }

    if (canvas) {
      canvas.addEventListener('click', function (ev) {
        var caja = canvas.getBoundingClientRect();
        var mx = ev.clientX - caja.left, my = ev.clientY - caja.top;
        for (var k = 0; k < barras.length; k++) {
          var c = barras[k];
          if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
            seleccionar(c.i);
            return;
          }
        }
      });
      window.addEventListener('resize', dibujar);
      var alternador = document.getElementById('theme-toggle');
      if (alternador) alternador.addEventListener('click', function () {
        setTimeout(dibujar, 60);
      });
    }

    fetch('/api/v1/tableros/rechazos')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elLista.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        datos = j;
        document.getElementById('tr-total').textContent = num(j.total);
        document.getElementById('tr-razones').textContent = num(j.n_razones);
        document.getElementById('tr-r80').textContent = num(j.razones_para_80);
        var sr = document.getElementById('tr-sinrazon');
        sr.textContent = num(j.sin_razon);
        sr.classList.toggle('riesgo', j.sin_razon > 0);
        pintarLista();
        dibujar();
      })
      .catch(function () {
        elLista.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
      });
  });
})();
