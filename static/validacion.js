/* GNOSIS · VALIDACIÓN (F10, VLD-02) — la glosa preventiva.
   Cada regla del motor se pinta con su banda de conformidad: tramo
   acento = filas conformes, tramo magenta = violaciones (alerta real).
   Una regla en cero es conformidad probada y se muestra. Tocar una
   regla lista sus filas violadoras en la ficha. CERO snake oil: todo
   número es salida de autogenes/validacion.py. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var elReglas = document.getElementById('vl-reglas');
    var elDetalle = document.getElementById('vl-detalle');
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

    function pintarReglas() {
      var html = '';
      datos.reglas.forEach(function (rg, i) {
        var pOk = rg.base ? 100 * (rg.base - rg.n) / rg.base : 100;
        html += '<button type="button" class="cn-caja qa-item' +
          (i === activo ? ' activo' : '') + (rg.n ? '' : ' vl-ok') +
          '" data-i="' + i + '">' +
          '<span class="clase">' + esc(rg.fuente) + '</span>' +
          '<span class="fila"><span class="titulo">' + esc(rg.titulo) + '</span>' +
          '<span class="monto' + (rg.n ? '' : ' neutro') + '">' +
          (rg.n ? rg.n + ' de ' + num(rg.base) : num(rg.base) + ' conformes') +
          '</span></span>' +
          '<span class="vl-banda"><span class="ok" style="width:' +
          pOk.toFixed(1) + '%"></span>' +
          (rg.n ? '<span class="hueco" style="width:' + (100 - pOk).toFixed(1) +
            '%"></span>' : '') + '</span>' +
          '<p class="detalle">' + esc(rg.norma) + '</p></button>';
      });
      elReglas.innerHTML = html;
      elReglas.querySelectorAll('.cn-caja').forEach(function (btn) {
        btn.addEventListener('click', function () {
          activo = Number(btn.dataset.i);
          pintarReglas();
          pintarFicha(datos.reglas[activo]);
        });
      });
    }

    function pintarFicha(rg) {
      var html = '<span class="cn-ficha-clase">' + esc(rg.fuente) + '</span>' +
        '<h3 style="margin:2px 0 2px">' + esc(rg.titulo) + '</h3>' +
        '<div class="cn-ficha-monto' + (rg.n ? '' : ' neutro') + '">' +
        (rg.n ? rg.n + ' / ' + num(rg.base) : 'conforme') + '</div>' +
        '<p class="qa-base-hint" style="margin:0 0 8px">' + esc(rg.norma) + '</p>';
      if (!rg.n) {
        html += '<p class="qa-base-hint">Ninguna fila viola esta regla — ' +
          'conformidad probada sobre ' + num(rg.base) + ' filas.</p>';
      } else {
        html += '<div class="qa-sec">Filas violadoras</div><div class="qa-lista">';
        rg.refs.forEach(function (r) {
          var partes = [];
          if (r.factura) partes.push('factura <b>' + esc(r.factura) + '</b>');
          if (r.chasis) partes.push('chasis <b>' + esc(r.chasis) + '</b>');
          if (r.filename) partes.push('PDF <b>' + esc(r.filename) + '</b>');
          html += '<div class="cn-ref"><span>' +
            (partes.join(' · ') || 'fila sin identificadores') + '</span></div>';
        });
        if (rg.n > rg.refs.length) {
          html += '<p class="qa-base-hint">+' + (rg.n - rg.refs.length) +
            ' más — el conteo SÍ las incluye.</p>';
        }
        html += '</div>';
      }
      elDetalle.innerHTML = html;
    }

    // ── expediente certificado: la conformidad viva como producto ────
    var btnCert = document.getElementById('vl-certificar');
    btnCert.addEventListener('click', function () {
      var msj = document.getElementById('vl-msj');
      btnCert.disabled = true;
      msj.className = 'ag-msj';
      msj.textContent = 'Certificando…';
      fetch('/api/v1/autogenes/validacion/certificado', { method: 'POST' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) {
            btnCert.disabled = false;
            msj.className = 'ag-msj error';
            msj.textContent = res.j.error || 'No se pudo certificar — reintenta';
            return;
          }
          btnCert.textContent = 'certificado dockeado';
          msj.textContent = '«' + res.j.producto.titulo + '» ya es producto del grafo';
        })
        .catch(function () {
          btnCert.disabled = false;
          msj.className = 'ag-msj error';
          msj.textContent = 'Sin conexión — reintenta';
        });
    });

    fetch('/api/v1/autogenes/validacion')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elReglas.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        datos = j;
        document.getElementById('vl-dwh').textContent = num(j.filas.dwh);
        document.getElementById('vl-pdf').textContent = num(j.filas.pdf);
        var pct = document.getElementById('vl-pct');
        pct.textContent = j.conformidad_pct == null ? '—' : j.conformidad_pct + '%';
        var total = document.getElementById('vl-total');
        total.textContent = num(j.total_violaciones);
        total.classList.toggle('riesgo', j.total_violaciones > 0);
        pintarReglas();
      })
      .catch(function () {
        elReglas.innerHTML = '<p class="qa-base-hint">Sin conexión con el sustrato.</p>';
      });
  });
})();
