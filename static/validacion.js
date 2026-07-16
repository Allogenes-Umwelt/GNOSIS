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
    var elLedger = document.getElementById('vl-ledger');
    var elFiltros = document.getElementById('vl-filtros');
    var elVerif = document.getElementById('vl-verificadas');
    var CV = window.CicloVida;
    var datos = null;
    var activo = -1;
    var filtro = 'todos';

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function num(n) {
      return n == null ? '—' : Number(n).toLocaleString('es-MX');
    }

    function pintarCiclo() {
      // el triaje es sobre las reglas VIOLADAS (las conformes no se disponen)
      elLedger.innerHTML = CV.ledger(datos.estados || {}, 0);
      elFiltros.innerHTML = CV.filtros(datos.estados || {}, filtro);
      var glosa = {};
      datos.reglas.forEach(function (rg) { glosa[rg.clave] = rg.titulo; });
      elVerif.innerHTML = CV.verificadas(datos.resoluciones_verificadas, glosa);
    }

    function pintarReglas() {
      pintarCiclo();
      var html = '';
      datos.reglas.forEach(function (rg, i) {
        var viol = rg.n > 0;
        // el filtro por estado sólo aplica a las violadas; las conformes
        // sólo aparecen en «todos»
        if (viol ? !CV.pasa(rg, filtro) : filtro !== 'todos') return;
        var pOk = rg.base ? 100 * (rg.base - rg.n) / rg.base : 100;
        var cerrada = rg.estado === 'resuelto' || rg.estado === 'descartado';
        html += '<div class="cn-caja' + (i === activo ? ' activo' : '') +
          (viol ? '' : ' vl-ok') +
          (viol && rg.contradice ? ' contradicha' : (viol && cerrada ? ' cerrada' : '')) +
          '" data-i="' + i + '">' +
          '<button type="button" class="cn-caja-head" data-sel="' + i + '">' +
          '<span class="fila" style="gap:8px">' +
          (viol ? CV.sevChip(rg.severidad) : '') +
          '<span class="clase">' + esc(rg.fuente) + '</span>' +
          '<span class="monto' + (viol ? '' : ' neutro') +
          '" style="margin-left:auto">' +
          (viol ? rg.n + ' de ' + num(rg.base) : num(rg.base) + ' conformes') +
          '</span></span>' +
          '<span class="titulo" style="display:block;margin-top:4px">' +
          esc(rg.titulo) + '</span>' +
          '<span class="vl-banda"><span class="ok" style="width:' +
          pOk.toFixed(1) + '%"></span>' +
          (viol ? '<span class="hueco" style="width:' + (100 - pOk).toFixed(1) +
            '%"></span>' : '') + '</span>' +
          '<p class="detalle">' + esc(rg.norma) + '</p></button>' +
          (viol ? '<div class="cv-vida">' + CV.seg(rg.clave, rg.estado) +
            CV.traza(rg) + '</div>' + CV.contra(rg) : '') +
          '</div>';
      });
      elReglas.innerHTML = html || '<p class="qa-base-hint">Ninguna regla en ' +
        'este estado.</p>';
      elReglas.querySelectorAll('.cn-caja-head').forEach(function (btn) {
        btn.addEventListener('click', function () {
          activo = Number(btn.dataset.sel);
          pintarReglas();
          pintarFicha(datos.reglas[activo]);
        });
      });
    }

    function recargar() {
      var claveActiva = activo >= 0 && datos ? datos.reglas[activo].clave : null;
      fetch('/api/v1/autogenes/validacion')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) return;
          datos = j;
          activo = claveActiva
            ? datos.reglas.findIndex(function (r) { return r.clave === claveActiva; })
            : -1;
          document.getElementById('vl-pct').textContent =
            j.conformidad_pct == null ? '—' : j.conformidad_pct + '%';
          var total = document.getElementById('vl-total');
          total.textContent = num(j.total_violaciones);
          total.classList.toggle('riesgo', j.total_violaciones > 0);
          pintarReglas();
        });
    }

    var btnExport = document.getElementById('vl-export');
    if (btnExport) btnExport.addEventListener('click', function () {
      if (!datos) return;
      CV.exportarCSV('VLD-02 · VALIDACIÓN', datos.session_id,
        ['clave', 'fuente', 'titulo', 'base', 'violaciones', 'norma'],
        datos.reglas.map(function (r) {
          return [r.clave, r.fuente, r.titulo, r.base, r.n, r.norma];
        }), 'validacion',
        'todas las reglas evaluadas — salida determinista del motor');
    });

    CV.conectar(elReglas, 'validacion', recargar);
    elFiltros.addEventListener('click', function (ev) {
      var b = ev.target.closest('.cv-filtro');
      if (!b) return;
      filtro = b.dataset.filtro;
      pintarReglas();
    });

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
          msj.innerHTML = '«' + esc(res.j.producto.titulo) + '» dockeado · ' +
            '<a href="/autogenes/expediente/' + esc(res.j.producto.id) +
            '" target="_blank" rel="noopener">abrir expediente</a>';
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
