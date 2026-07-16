/* GNOSIS · TBV-02 DOMINIO — escalera de rangos de los más vendidos.
   Izquierda: ranking escalonado por marca (total real facturado) con
   desglose de su unidad dominante. Derecha: cada modelo una línea por
   su POSICIÓN en el ranking de cada periodo (dial mes/trim/sem/año);
   sin ventas la línea se corta — nada se interpola. Tocar una marca
   ilumina sus modelos. CERO snake oil: rangos y conteos del motor;
   filas sin fecha parseable declaradas. Datos: /api/v1/tableros/dominio. */
(function () {
  'use strict';

  var MARGEN = { izq: 46, der: 150, arr: 26, aba: 34 };

  document.addEventListener('DOMContentLoaded', function () {
    var elMarcas = document.getElementById('td-marcas');
    var elDetalle = document.getElementById('td-detalle');
    var lienzo = document.getElementById('td-lienzo');
    var canvas = lienzo && lienzo.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');
    var datos = null;
    var marcaActiva = null;
    var escala = 'mes';
    var colores = {};
    var reqSeq = 0;

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
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      var pers = datos.periodos, series = datos.series;
      if (!pers.length || !series.length) {
        ctx.fillStyle = colores.t3;
        ctx.font = '11px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('SIN VENTAS FECHADAS — EL RANKING NACE CON FECFACT', w / 2, h / 2);
        return;
      }
      var maxRango = Math.max.apply(null, series.map(function (s) {
        return Math.max.apply(null, s.rangos.map(function (r) { return r || 1; }));
      }).concat([series.length]));
      function X(i) {
        return pers.length === 1 ? (MARGEN.izq + (w - MARGEN.der)) / 2
          : MARGEN.izq + (i / (pers.length - 1)) * (w - MARGEN.izq - MARGEN.der);
      }
      function Y(r) {
        return MARGEN.arr + ((r - 1) / Math.max(1, maxRango - 1)) *
          (h - MARGEN.arr - MARGEN.aba);
      }

      // retícula de rangos + eje
      ctx.font = '9px ' + colores.mono;
      for (var r = 1; r <= maxRango; r++) {
        ctx.strokeStyle = alfa(colores.linea, 0.25);
        ctx.beginPath();
        ctx.moveTo(MARGEN.izq, Y(r));
        ctx.lineTo(w - MARGEN.der, Y(r));
        ctx.stroke();
        ctx.fillStyle = colores.t3;
        ctx.textAlign = 'right';
        ctx.fillText('#' + r, MARGEN.izq - 8, Y(r) + 3);
      }
      pers.forEach(function (p, i) {
        ctx.fillStyle = colores.t3;
        ctx.textAlign = 'center';
        ctx.fillText(p, X(i), h - 10);
      });

      // las trayectorias: la marca activa en acento pleno, el resto tenue
      series.forEach(function (s) {
        var activa = !marcaActiva || s.marca === marcaActiva;
        var tinta = activa ? colores.acc : colores.t3;
        var af = activa ? 0.95 : 0.28;
        ctx.strokeStyle = alfa(tinta, af);
        ctx.lineWidth = activa && marcaActiva ? 2.4 : 1.5;
        ctx.beginPath();
        var abierta = false;
        s.rangos.forEach(function (rg, i) {
          if (rg == null) { abierta = false; return; }
          if (!abierta) { ctx.moveTo(X(i), Y(rg)); abierta = true; }
          else ctx.lineTo(X(i), Y(rg));
        });
        ctx.stroke();
        ctx.lineWidth = 1;
        s.rangos.forEach(function (rg, i) {
          if (rg == null) return;
          ctx.beginPath();
          ctx.arc(X(i), Y(rg), activa && marcaActiva ? 4 : 2.6, 0, 6.283);
          ctx.fillStyle = alfa(tinta, af);
          ctx.fill();
        });
        // etiqueta al borde derecho, en su último rango conocido
        var ultimo = null, idx = -1;
        s.rangos.forEach(function (rg, i) { if (rg != null) { ultimo = rg; idx = i; } });
        if (ultimo != null && (activa || series.length <= 6)) {
          ctx.fillStyle = activa ? colores.accText : alfa(colores.t3, 0.7);
          ctx.font = (activa && marcaActiva ? '700 ' : '') + '9px ' + colores.mono;
          ctx.textAlign = 'left';
          var nombre = s.modelo.length > 18 ? s.modelo.slice(0, 17) + '…' : s.modelo;
          ctx.fillText(nombre + ' · ' + s.ventas[idx], w - MARGEN.der + 8,
                       Y(ultimo) + 3);
        }
      });
    }

    function pintarMarcas() {
      if (!datos.ranking_marcas.length) {
        elMarcas.innerHTML = '<p class="qa-base-hint">Sin ventas fechadas en ' +
          'la sesión.</p>';
        return;
      }
      var maxTotal = datos.ranking_marcas[0].total;
      var html = '';
      datos.ranking_marcas.forEach(function (m) {
        var activa = m.marca === marcaActiva;
        var pct = maxTotal ? (100 * m.total / maxTotal).toFixed(1) : 0;
        html += '<button type="button" class="cn-caja qa-item' +
          (activa ? ' activo' : '') + '" data-marca="' + esc(m.marca) + '"' +
          ' style="border-left-color:var(--acc-solid)">' +
          '<span class="fila"><span class="titulo">' + esc(m.marca) + '</span>' +
          '<span class="monto" style="color:var(--acc-text)">' + num(m.total) +
          ' uds</span></span>' +
          '<span class="vl-banda"><span class="ok" style="width:' + pct +
          '%"></span></span>' +
          '<p class="detalle">' + m.n_modelos + ' modelos · domina «' +
          esc(m.top_modelo) + '» con ' + num(m.top_n) + ' unidades</p></button>';
      });
      elMarcas.innerHTML = html;
      elMarcas.querySelectorAll('.cn-caja').forEach(function (btn) {
        btn.addEventListener('click', function () {
          marcaActiva = marcaActiva === btn.dataset.marca ? null : btn.dataset.marca;
          pintarMarcas();
          pintarDetalle();
          dibujar();
        });
      });
    }

    function pintarDetalle() {
      if (!marcaActiva) { elDetalle.innerHTML = ''; return; }
      var m = datos.ranking_marcas.find(function (x) { return x.marca === marcaActiva; });
      if (!m) { elDetalle.innerHTML = ''; return; }
      elDetalle.innerHTML = '<div class="qa-sec">' + esc(m.marca) +
        ' · desglose</div><div class="qa-lista">' +
        '<div class="cn-ref"><span>unidad más vendida: <b>' + esc(m.top_modelo) +
        '</b> con <b>' + num(m.top_n) + '</b> de ' + num(m.total) +
        ' unidades</span></div></div>';
    }

    function cargar() {
      var mi = ++reqSeq;
      fetch('/api/v1/tableros/dominio?escala=' + encodeURIComponent(escala))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (mi !== reqSeq) return;
          if (!j || j.error) {
            elMarcas.innerHTML = '<p class="qa-base-hint">' +
              esc((j && j.error) || 'Sin datos') + '</p>';
            return;
          }
          datos = j;
          document.getElementById('td-total').textContent = num(j.facturadas);
          document.getElementById('td-modelos').textContent =
            num(j.series.length + j.recorte);
          document.getElementById('td-periodos').textContent = num(j.periodos.length);
          var sf = document.getElementById('td-sinfecha');
          sf.textContent = num(j.sin_fecha);
          sf.classList.toggle('riesgo', j.sin_fecha > 0);
          pintarMarcas();
          pintarDetalle();
          dibujar();
        })
        .catch(function () {
          elMarcas.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
        });
    }

    document.querySelectorAll('#td-dial button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#td-dial button').forEach(function (x) {
          x.classList.toggle('activo', x === b);
        });
        escala = b.dataset.escala;
        cargar();
      });
    });

    if (canvas) {
      window.addEventListener('resize', dibujar);
      var alternador = document.getElementById('theme-toggle');
      if (alternador) alternador.addEventListener('click', function () {
        setTimeout(dibujar, 60);
      });
    }
    cargar();
  });
})();
