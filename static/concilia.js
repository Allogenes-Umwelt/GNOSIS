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
    var elCupos = document.getElementById('cn-cupos');
    var btnDossier = document.getElementById('cn-dossier');
    var elMsj = document.getElementById('cn-msj');
    var elLedger = document.getElementById('cn-ledger');
    var elFiltros = document.getElementById('cn-filtros');
    var elVerif = document.getElementById('cn-verificadas');
    var CV = window.CicloVida;
    var datos = null;
    var activo = -1;
    var filtro = 'todos';

    // etiquetas de negocio para las resoluciones verificadas (claves fijas)
    var GLOSA = {
      'conc-vendido-sin-llegada': 'Vendidas sin factura física',
      'conc-jn-disputa': 'Preferencia arancelaria en disputa',
      'conc-pais-disputa': 'País de origen en disputa',
      'conc-vin-dup-dwh': 'VIN repetido en el DWH',
      'conc-vin-dup-llegadas': 'VIN repetido en las llegadas',
      'conc-sin-pedimento': 'Vendidas sin pedimento vinculado',
      'conc-extraccion-fallida': 'PDFs ilegibles',
      'conc-pedimento-sin-unidades': 'Pedimentos sin unidades vinculadas',
      'conc-vin-inter-sesion': 'Chasis vendido en más de una sesión'
    };

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

    function pintarCiclo() {
      // ledger de triaje + filtro por estado (foco de la gestión)
      var riesgoSin = datos.hallazgos.reduce(function (s, h) {
        return s + ((h.estado || 'nuevo') === 'nuevo' && h.monto ? h.monto : 0);
      }, 0);
      elLedger.innerHTML = CV.ledger(datos.estados || {}, riesgoSin);
      elFiltros.innerHTML = CV.filtros(datos.estados || {}, filtro);
      elVerif.innerHTML = CV.verificadas(datos.resoluciones_verificadas, GLOSA);
    }

    function pintarLista() {
      pintarCiclo();
      if (!datos.hallazgos.length) {
        elLista.innerHTML = '<p class="qa-base-hint">Sesión conciliada — cero ' +
          'hallazgos. Las bandas de arriba son la prueba: todo lo vendido ' +
          'tiene llegada y nada llegado sobra.</p>';
        return;
      }
      var html = '';
      datos.hallazgos.forEach(function (h, i) {
        if (!CV.pasa(h, filtro)) return;
        var monto = dinero(h.monto, h.moneda);
        var cerrada = h.estado === 'resuelto' || h.estado === 'descartado';
        html += '<div class="cn-caja' + (i === activo ? ' activo' : '') +
          (h.contradice ? ' contradicha' : (cerrada ? ' cerrada' : '')) +
          '" data-i="' + i + '">' +
          '<button type="button" class="cn-caja-head" data-sel="' + i + '">' +
          '<span class="fila" style="gap:8px">' + CV.sevChip(h.severidad) +
          '<span class="clase">' + esc(h.clase.replace(/_/g, ' ')) + '</span>' +
          '<span class="monto' + (monto ? '' : ' neutro') +
          '" style="margin-left:auto">' + (monto || 'sin monto') + '</span></span>' +
          '<span class="titulo" style="display:block;margin-top:4px">' +
          esc(h.titulo) + '</span>' +
          '<p class="detalle">' + esc(h.detalle) + '</p></button>' +
          '<div class="cv-vida">' + CV.seg(h.clave, h.estado) + CV.traza(h) + '</div>' +
          CV.contra(h) + '</div>';
      });
      elLista.innerHTML = html || '<p class="qa-base-hint">Ningún hallazgo en ' +
        'este estado.</p>';
      elLista.querySelectorAll('.cn-caja-head').forEach(function (btn) {
        btn.addEventListener('click', function () {
          seleccionar(Number(btn.dataset.sel));
        });
      });
    }

    function seleccionar(i) {
      activo = i;
      pintarLista();
      pintarFicha(datos.hallazgos[i]);
      dibujarCaudal();
    }

    // recarga viva tras disponer: el motor re-deriva y contrasta
    function recargar() {
      var claveActiva = activo >= 0 && datos ? datos.hallazgos[activo].clave : null;
      fetch('/api/v1/autogenes/concilia')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) return;
          datos = j;
          activo = claveActiva
            ? datos.hallazgos.findIndex(function (h) { return h.clave === claveActiva; })
            : -1;
          pintarFlujo(j.flujo, j.valor_en_riesgo_mxn);
          pintarLista();
          dibujarCaudal();
        });
    }

    // export CSV de los hallazgos (datos crudos del motor)
    var btnExport = document.getElementById('cn-export');
    if (btnExport) btnExport.addEventListener('click', function () {
      if (!datos) return;
      CV.exportarCSV('CNC-01 · CONCILIA', datos.session_id,
        ['clave', 'clase', 'titulo', 'monto', 'moneda', 'n_unidades',
         'estado', 'contradice'],
        datos.hallazgos.map(function (h) {
          return [h.clave, h.clase, h.titulo, h.monto == null ? '' : h.monto,
                  h.moneda || '', h.n_unidades, h.estado || 'nuevo',
                  h.contradice ? 'sí' : 'no'];
        }), 'concilia',
        'conteos y montos reales del motor — sin estimaciones');
    });

    // SPC: la sesión en su historia
    if (window.Control) window.Control.montar('cn-control');

    // disposición (delegada) + filtro
    CV.conectar(elLista, 'concilia', recargar);
    elFiltros.addEventListener('click', function (ev) {
      var b = ev.target.closest('.cv-filtro');
      if (!b) return;
      filtro = b.dataset.filtro;
      pintarLista();
    });

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
      btnDossier.style.display = '';
      btnDossier.disabled = false;
      btnDossier.textContent = 'dockear dossier';
      elMsj.textContent = '';
    }

    // ── lookup directo: estado vivo tri-fuente de un VIN ─────────────
    var formVin = document.getElementById('cn-vin-form');
    if (formVin) formVin.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var q = document.getElementById('cn-vin').value.trim();
      if (!q) return;
      btnDossier.style.display = 'none';
      elDetalle.innerHTML = '<p class="qa-base-hint">Buscando…</p>';
      fetch('/api/v1/autogenes/concilia/vin?chasis=' + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (v) {
          if (v.error) {
            elDetalle.innerHTML = '<p class="qa-base-hint">' + esc(v.error) + '</p>';
            return;
          }
          if (v.ambiguo) {
            elDetalle.innerHTML = '<p class="qa-base-hint">Varios chasis ' +
              'casan — precisa uno:</p><div class="qa-lista">' +
              v.candidatos.map(function (c) {
                return '<div class="cn-ref"><b>' + esc(c) + '</b></div>';
              }).join('') + '</div>';
            return;
          }
          var html = '<h3 style="margin:0 0 2px;font-family:var(--font-mono);' +
            'font-size:.85rem">' + esc(v.chasis) + '</h3>' +
            '<div class="cn-estado' + (v.conciliado ? '' : ' mal') + '">' +
            (v.conciliado ? 'conciliado' : 'sin conciliar') + '</div>';
          if (v.duplicado_dwh || v.duplicado_llegadas) {
            html += '<p class="qa-base-hint" style="color:var(--danger)">VIN ' +
              'repetido en ' + (v.duplicado_dwh ? 'el DWH' : 'las llegadas') + '.</p>';
          }
          html += '<div class="qa-sec">DWH · vendido</div><div class="qa-lista">';
          html += v.dwh.length ? v.dwh.map(function (d) {
            return '<div class="cn-ref"><b>' + esc(d.factura || 's/f') + '</b>' +
              '<span>' + (d.precio != null ? '$' +
                Number(d.precio).toLocaleString('es-MX') + ' MXN · ' : '') +
              'J/N <b>' + esc(d.j_y_n || '—') + '</b> · país <b>' +
              esc(d.pais_code || '—') + '</b>' +
              (d.numero_pedimento ? ' · pedimento <b>' + esc(d.numero_pedimento) +
                '</b>' : ' · sin pedimento') + '</span></div>';
          }).join('') : '<p class="qa-base-hint">Nada vendido con este chasis.</p>';
          html += '</div><div class="qa-sec">PDF · llegado</div><div class="qa-lista">';
          html += v.llegadas.length ? v.llegadas.map(function (d) {
            return '<div class="cn-ref"><b>' + esc(d.filename || d.factura || 's/f') +
              '</b><span>' + (d.amount ? esc(d.amount) + ' ' +
                esc(d.moneda || '') + ' · ' : '') +
              'J/N <b>' + esc(d.j_y_n || '—') + '</b> · país <b>' +
              esc(d.pais_code || '—') + '</b></span></div>';
          }).join('') : '<p class="qa-base-hint">Ninguna factura física lo cita.</p>';
          html += '</div>';
          if (v.disputas.length) {
            html += '<div class="qa-sec">En disputa</div><div class="qa-lista">' +
              v.disputas.map(function (d) {
                return '<div class="cn-ref"><span>' + esc(d.campo) +
                  ': DWH dice <b>' + esc(d.dwh) + '</b> · PDF dice <b>' +
                  esc(d.pdf) + '</b></span></div>';
              }).join('') + '</div>';
          }
          elDetalle.innerHTML = html;
        })
        .catch(function () {
          elDetalle.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
        });
    });

    // ── dossier de defensa: snapshot completo del hallazgo vivo ─────
    btnDossier.addEventListener('click', function () {
      if (activo < 0 || !datos) return;
      var clave = datos.hallazgos[activo].clave;
      btnDossier.disabled = true;
      elMsj.className = 'ag-msj';
      elMsj.textContent = 'Dockeando…';
      fetch('/api/v1/autogenes/concilia/dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: clave })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) {
            btnDossier.disabled = false;
            elMsj.className = 'ag-msj error';
            elMsj.textContent = res.j.error || 'No se pudo dockear — reintenta';
            return;
          }
          btnDossier.textContent = 'dossier dockeado';
          elMsj.innerHTML = '«' + esc(res.j.producto.titulo) + '» dockeado · ' +
            '<a href="/autogenes/expediente/' + esc(res.j.producto.id) +
            '" target="_blank" rel="noopener">abrir expediente</a>';
        })
        .catch(function () {
          btnDossier.disabled = false;
          elMsj.className = 'ag-msj error';
          elMsj.textContent = 'Sin conexión — reintenta';
        });
    });

    // ── cupos what-if: proyección sobre run-rate medido ──────────────
    function pintarCupos(c) {
      if (!c.cupos.length) {
        elCupos.innerHTML = '<p class="qa-base-hint">La sesión no tiene ' +
          'cupos registrados.</p>';
        return;
      }
      var html = '';
      c.cupos.forEach(function (q) {
        var linea;
        if (q.motivo) {
          linea = esc(q.motivo);
        } else {
          linea = 'run-rate <b>' + num(q.run_rate) + '</b>/mes → se agota en ~<b>' +
            num(q.meses_restantes) + '</b> meses' +
            (q.mes_estimado_agote ? ' (mes ' + q.mes_estimado_agote + ')'
              : ' — fuera del ejercicio');
        }
        html += '<div class="cn-ref' + (q.mes_agotado ? ' agotado' : '') + '">' +
          '<b>' + esc(q.tipo) + ' · ' + esc(q.numero || 's/n') + '</b>' +
          '<span>saldo <b>' + num(q.saldo) + '</b> de ' + num(q.inicial) +
          ' · ' + linea + '</span></div>';
      });
      html += '<p class="qa-base-hint">' + esc(c.nota) + '</p>';
      elCupos.innerHTML = html;
    }

    fetch('/api/v1/autogenes/concilia/cupos')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elCupos.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        pintarCupos(j);
      })
      .catch(function () {
        elCupos.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
      });

    // ── ANATOMÍA DEL CAUDAL: escalera de derivaciones (P&ID, SVG) ────
    // La espina vertical VENDIDO→CONCILIADO→LLEGADO; cada fuga cuelga como
    // derivación con su estación (código FG, severidad, monto, título
    // COMPLETO — jamás truncado). Presupuesto de tinta: sólo la fuga en foco
    // arde; el resto es fantasma. SVG determinista (cero RNG); el color sale
    // de tokens vía CSS, así que el cambio de tema no exige redibujar.
    var elCaudal = document.getElementById('cn-caudal');

    // a qué manifold pertenece cada clase de hallazgo
    var LADO = {
      vendido_sin_llegada: 'izq', sin_pedimento: 'izq', vin_duplicado_dwh: 'izq',
      pedimento_sin_unidades: 'izq', vin_inter_sesion: 'izq',
      llegado_sin_venta: 'der', vin_duplicado_llegadas: 'der',
      extraccion_fallida: 'der',
      jn_en_disputa: 'centro', pais_en_disputa: 'centro'
    };
    var RANGO = { centro: 0, der: 1 };

    function pad2(n) { return ('0' + n).slice(-2); }
    function corta(s, max) { return s.length > max ? s.slice(0, max - 1) + '…' : s; }
    function pesos(m) { return '$' + Math.round(m).toLocaleString('es-MX'); }

    function focoIndex(hs) {
      if (activo >= 0) return activo;
      for (var i = 0; i < hs.length; i++) {
        var e = hs[i].estado;
        if (e !== 'resuelto' && e !== 'descartado') return i;
      }
      return hs.length ? 0 : -1;
    }

    function dibujarCaudal() {
      if (!elCaudal || !datos) return;
      var hs = datos.hallazgos, f = datos.flujo;
      var W = 900, cx = 455, LX0 = 40, LX1 = 350, RX0 = 560, RX1 = 860;
      var BOXH = 46, ROW = 70, TOP = 124, spineTop = 96;

      if (!f.vendidos && !f.llegados) {
        elCaudal.innerHTML = '<p class="qa-base-hint">Sin datos aduanales — ' +
          'el caudal nace con la sesión.</p>';
        return;
      }

      var izq = [], der = [];
      hs.forEach(function (h, i) {
        ((LADO[h.clase] || 'centro') === 'izq' ? izq : der).push({ h: h, i: i });
      });
      der.sort(function (a, b) {
        return (RANGO[LADO[a.h.clase] || 'centro'] - RANGO[LADO[b.h.clase] || 'centro'])
          || (a.i - b.i);
      });

      var rows = Math.max(izq.length, der.length, 1);
      var spineBottom = TOP + rows * ROW + 8;
      var H = spineBottom + 60;
      // la junta se ancla al hueco entre filas más cercano al centro de la
      // espina — nunca sobre una fila, para que su máscara no tape un leader
      var gaps = [TOP - (ROW - BOXH) / 2 - 2];
      for (var gk = 0; gk < rows; gk++) gaps.push(TOP + gk * ROW + BOXH + (ROW - BOXH) / 2);
      var centro = (spineTop + spineBottom) / 2;
      var juntaY = Math.round(gaps.reduce(function (best, g) {
        return Math.abs(g - centro) < Math.abs(best - centro) ? g : best;
      }, gaps[0]));
      var foco = focoIndex(hs);

      var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="cd-svg" ' +
        'role="group" aria-label="Escalera de derivaciones del caudal">';
      s += '<defs><pattern id="cd-grid" width="40" height="40" ' +
        'patternUnits="userSpaceOnUse"><path d="M40 0H0V40" class="cd-gridline"/>' +
        '</pattern><filter id="cd-glow" x="-40%" y="-40%" width="180%" height="180%">' +
        '<feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/>' +
        '<feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
      s += '<rect width="' + W + '" height="' + H + '" fill="url(#cd-grid)"/>';
      s += '<g class="cd-reg"><path d="M14 22V14H22M' + (W - 22) + ' 14h8v8M' +
        (W - 14) + ' ' + (H - 22) + 'v8h-8M22 ' + (H - 14) + 'h-8v-8"/></g>';
      s += '<text x="24" y="30" class="cd-hd">ESCALERA DE DERIVACIONES · F9</text>';
      s += '<text x="' + (W - 24) + '" y="30" text-anchor="end" class="cd-hd-alert">' +
        datos.total + (datos.total === 1 ? ' FUGA · ' : ' FUGAS · ') +
        (datos.valor_en_riesgo_mxn > 0 ? pesos(datos.valor_en_riesgo_mxn) +
          ' MXN EN RIESGO' : 'SIN MONTO EN RIESGO') + '</text>';

      // espina
      s += '<line x1="' + cx + '" y1="' + spineTop + '" x2="' + cx + '" y2="' +
        spineBottom + '" class="cd-bus-glow"/>';
      s += '<line x1="' + cx + '" y1="' + spineTop + '" x2="' + cx + '" y2="' +
        spineBottom + '" class="cd-bus"/>';

      function estacion(side, midY, st, n) {
        var h = st.h, i = st.i, foc = i === foco;
        var closed = (h.estado === 'resuelto' || h.estado === 'descartado') && !foc;
        var x0 = side === 'izq' ? LX0 : RX0, x1 = side === 'izq' ? LX1 : RX1;
        var inner = side === 'izq' ? x1 : x0, boxTop = midY - BOXH / 2;
        var monto = h.monto != null ? pesos(h.monto) + ' ' + (h.moneda || '') : 'SIN MONTO';
        var sev = h.severidad === 'danger' ? 'CRÍTICO' : 'REVISAR';
        var disp = (LADO[h.clase] || 'centro') === 'centro' ? ' ⟷' : '';
        var g = foc ? '▲' : '△';
        var wrap = foc ? ' filter="url(#cd-glow)"' : '';
        var gh = closed ? ' cd-ghost' : '';
        var o = '<line x1="' + cx + '" y1="' + midY + '" x2="' + inner + '" y2="' + midY +
          '" class="' + (foc ? 'cd-lead-foco' : 'cd-lead') + gh + '"' + wrap + '/>';
        o += '<circle cx="' + cx + '" cy="' + midY + '" r="' + (foc ? 2.6 : 1.8) +
          '" class="' + (foc ? 'cd-node-foco' : 'cd-node') + gh + '"/>';
        o += '<g class="cd-est' + (foc ? ' cd-est-foco' : '') + gh + '" role="button" ' +
          'tabindex="0" data-i="' + i + '" aria-label="' + esc(h.titulo) + ', ' +
          esc(monto) + ', ' + sev + '">';
        o += '<rect x="' + x0 + '" y="' + boxTop + '" width="' + (x1 - x0) + '" height="' +
          BOXH + '" class="' + (foc ? 'cd-box-foco' : 'cd-box') + '"' + wrap + '/>';
        o += '<text x="' + (x0 + 12) + '" y="' + (boxTop + 18) + '" class="cd-code">' +
          g + ' FG-' + pad2(n) + ' · ' + sev + disp + '</text>';
        o += '<text x="' + (x1 - 10) + '" y="' + (boxTop + 18) + '" text-anchor="end" ' +
          'class="' + (h.monto != null ? 'cd-monto' : 'cd-nulo') + '">' + esc(monto) + '</text>';
        o += '<text x="' + (x0 + 12) + '" y="' + (boxTop + 35) + '" class="cd-tit">' +
          esc(corta(h.titulo.toUpperCase(), 44)) + '</text></g>';
        return o;
      }

      if (izq.length) s += '<text x="' + LX0 + '" y="' + (TOP - 12) +
        '" class="cd-col">DERIVACIONES · DWH</text>';
      if (der.length) s += '<text x="' + RX0 + '" y="' + (TOP - 12) +
        '" class="cd-col">DERIVACIONES · PDF / DISPUTA</text>';
      izq.forEach(function (st, k) { s += estacion('izq', TOP + k * ROW + BOXH / 2, st, st.i + 1); });
      der.forEach(function (st, k) { s += estacion('der', TOP + k * ROW + BOXH / 2, st, st.i + 1); });

      function bar(y, conc, total) {
        var BW = 120, bx = cx - BW / 2, okW = total ? BW * conc / total : 0;
        var o = '<rect x="' + bx + '" y="' + (y - 4) + '" width="' + BW +
          '" height="8" class="cd-bar-bg"/>';
        o += '<rect x="' + bx + '" y="' + (y - 4) + '" width="' + okW.toFixed(1) +
          '" height="8" class="cd-bar-ok"/>';
        if (okW < BW - 0.5) o += '<rect x="' + (bx + okW).toFixed(1) + '" y="' + (y - 4) +
          '" width="' + (BW - okW).toFixed(1) + '" height="8" class="cd-bar-hueco"/>';
        return o;
      }
      // VENDIDO (arriba)
      s += '<text x="' + cx + '" y="52" text-anchor="middle" class="cd-num">' + f.vendidos + '</text>';
      s += '<text x="' + cx + '" y="66" text-anchor="middle" class="cd-mlabel">VENDIDO · DWH</text>';
      s += bar(80, f.conciliados, f.vendidos);
      // LLEGADO (abajo)
      s += bar(spineBottom, f.llegados - f.sin_venta, f.llegados);
      s += '<text x="' + cx + '" y="' + (spineBottom + 26) + '" text-anchor="middle" class="cd-num">' +
        f.llegados + '</text>';
      s += '<text x="' + cx + '" y="' + (spineBottom + 40) + '" text-anchor="middle" class="cd-mlabel">LLEGADO · PDF</text>';
      // CONCILIADO (junta)
      s += '<rect x="' + (cx - 80) + '" y="' + (juntaY - 26) + '" width="160" height="46" class="cd-mask"/>';
      s += '<text x="' + cx + '" y="' + (juntaY - 14) + '" text-anchor="middle" class="cd-mlabel">CONCILIADO</text>';
      s += '<path d="M' + cx + ' ' + (juntaY - 9) + ' l9 9 -9 9 -9 -9 Z" class="cd-junta" filter="url(#cd-glow)"/>';
      s += '<text x="' + (cx - 16) + '" y="' + (juntaY + 5) + '" text-anchor="end" class="cd-num-s">' + f.conciliados + '</text>';
      s += '<text x="' + (cx + 16) + '" y="' + (juntaY + 5) + '" class="cd-mlabel">' +
        (f.pct_conciliado != null ? f.pct_conciliado + '%' : '—') + '</text>';

      s += '<text x="24" y="' + (H - 12) + '" class="cd-foot">TRAZO DETERMINISTA · ' +
        'MONTOS REALES DEL MOTOR — SIN ESTIMACIONES</text>';
      s += '<text x="' + (W - 24) + '" y="' + (H - 12) + '" text-anchor="end" class="cd-foot">' +
        'TOCA UNA ESTACIÓN PARA ABRIR SU HALLAZGO</text>';
      s += '</svg>';

      elCaudal.innerHTML = s;
      elCaudal.querySelectorAll('.cd-est').forEach(function (g) {
        function abrir() { seleccionar(Number(g.dataset.i)); }
        g.addEventListener('click', abrir);
        g.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); }
        });
      });
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
        dibujarCaudal();
      })
      .catch(function () {
        elLista.innerHTML = '<p class="qa-base-hint">Sin conexión con el sustrato.</p>';
      });
  });
})();
