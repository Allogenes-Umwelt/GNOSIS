/* GNOSIS · CONCILIA (F9, CNC-01) — dashboard de conciliación tri-fuente.
   Todo número es salida del motor (autogenes/concilia.py): flujo
   vendido/conciliado/llegado, bandas de balance (hueco = magenta) y
   hallazgos monetizados ordenados por valor en riesgo. La ficha lista
   unidades y referencias exactas para auditar fila por fila. CERO snake
   oil: sesión limpia = cero hallazgos y se dice. Datos: /api/v1/autogenes/concilia. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var elLista = document.getElementById('cn-hallazgos');
    var elDetalle = document.getElementById('cn-detalle');
    var datos = null;
    var activo = -1;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function num(n) {
      return n == null ? '—' : Number(n).toLocaleString('es-MX');
    }
    function dinero(monto, moneda) {
      if (monto == null) return null;
      return '$' + Number(monto).toLocaleString('es-MX', { maximumFractionDigits: 0 }) +
        (moneda ? ' ' + moneda : '');
    }

    function pintarFlujo(f, riesgo) {
      document.getElementById('cn-vendidos').textContent = num(f.vendidos);
      document.getElementById('cn-conciliados').innerHTML = num(f.conciliados) +
        (f.pct_conciliado != null ? ' <small>' + f.pct_conciliado + '%</small>' : '');
      document.getElementById('cn-llegados').textContent = num(f.llegados);
      var elRiesgo = document.getElementById('cn-riesgo');
      elRiesgo.textContent = riesgo > 0 ? dinero(riesgo, '') : '$0';
      elRiesgo.classList.toggle('riesgo', riesgo > 0);

      function banda(idPista, idPct, total, ok) {
        var pista = document.getElementById(idPista);
        var pct = document.getElementById(idPct);
        pista.innerHTML = '';
        if (!total) { pct.textContent = 'sin filas'; return; }
        var pOk = Math.max(0, Math.min(100, 100 * ok / total));
        pista.innerHTML = '<div class="ok" style="width:' + pOk.toFixed(1) + '%"></div>' +
          (ok < total ? '<div class="hueco" style="width:' + (100 - pOk).toFixed(1) + '%"></div>' : '');
        pct.textContent = num(ok) + ' / ' + num(total);
      }
      banda('cn-banda-dwh', 'cn-pct-dwh', f.vendidos, f.conciliados);
      banda('cn-banda-pdf', 'cn-pct-pdf', f.llegados, f.llegados - f.sin_venta);
    }

    function pintarLista() {
      if (!datos.hallazgos.length) {
        elLista.innerHTML = '<p class="qa-base-hint">Sesión conciliada — cero ' +
          'hallazgos. Las bandas de arriba son la prueba: todo lo vendido ' +
          'tiene llegada y nada llegado sobra.</p>';
        return;
      }
      var html = '';
      datos.hallazgos.forEach(function (h, i) {
        var monto = dinero(h.monto, h.moneda);
        html += '<button type="button" class="cn-caja qa-item' +
          (i === activo ? ' activo' : '') + '" data-i="' + i + '">' +
          '<span class="clase">' + esc(h.clase.replace(/_/g, ' ')) + '</span>' +
          '<span class="fila"><span class="titulo">' + esc(h.titulo) + '</span>' +
          '<span class="monto' + (monto ? '' : ' neutro') + '">' +
          (monto || 'sin monto') + '</span></span>' +
          '<p class="detalle">' + esc(h.detalle) + '</p></button>';
      });
      elLista.innerHTML = html;
      elLista.querySelectorAll('.cn-caja').forEach(function (btn) {
        btn.addEventListener('click', function () {
          activo = Number(btn.dataset.i);
          pintarLista();
          pintarFicha(datos.hallazgos[activo]);
        });
      });
    }

    function pintarFicha(h) {
      var monto = dinero(h.monto, h.moneda);
      var html = '<span class="cn-ficha-clase">' +
        esc(h.clase.replace(/_/g, ' ')) + '</span>' +
        '<h3 style="margin:2px 0 2px">' + esc(h.titulo) + '</h3>' +
        '<div class="cn-ficha-monto' + (monto ? '' : ' neutro') + '">' +
        (monto || 'sin monto — no se estima') + '</div>' +
        '<p class="qa-base-hint" style="margin:0 0 8px">' + esc(h.detalle) + '</p>';

      html += '<div class="qa-sec">Unidades · ' + h.n_unidades + '</div><div class="qa-lista">';
      h.unidades.forEach(function (u) {
        html += '<div class="cn-ref"><b>' + esc(u) + '</b></div>';
      });
      if (h.n_unidades > h.unidades.length) {
        html += '<p class="qa-base-hint">+' + (h.n_unidades - h.unidades.length) +
          ' más — el conteo y el monto SÍ las incluyen.</p>';
      }
      html += '</div><div class="qa-sec">Referencias</div><div class="qa-lista">';
      h.refs.forEach(function (r) {
        var partes = [];
        if (r.factura) partes.push('factura <b>' + esc(r.factura) + '</b>');
        if (r.chasis) partes.push('chasis <b>' + esc(r.chasis) + '</b>');
        if (r.dwh) {
          partes.push('DWH dice <b>' + esc(r.dwh) + '</b> · PDF dice <b>' +
            esc(r.pdf) + '</b>');
        }
        if (r.filename) partes.push('PDF <b>' + esc(r.filename) + '</b>');
        if (r.veces) partes.push('<b>' + r.veces + '</b> veces');
        html += '<div class="cn-ref"><span>' + partes.join(' · ') + '</span></div>';
      });
      html += '</div>';
      elDetalle.innerHTML = html;
    }

    fetch('/api/v1/autogenes/concilia')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elLista.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        datos = j;
        pintarFlujo(j.flujo, j.valor_en_riesgo_mxn);
        pintarLista();
      })
      .catch(function () {
        elLista.innerHTML = '<p class="qa-base-hint">Sin conexión con el sustrato.</p>';
      });
  });
})();
