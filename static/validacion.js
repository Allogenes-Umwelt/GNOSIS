/* GNOSIS · VALIDACIÓN (F10, VLD-02) — la glosa preventiva como LATTICE de
   conformidad. El universo U de la sesión desciende por los tamices de norma;
   cada fila cae en su PEOR capa (rechazado sobre observado) y lo que sobrevive
   todos los tamices es ⊥ = ⋂ V̄ᵣ, la conformidad probada. NOMOS converge aquí
   (O5.1): sus reglas del operador entran al estrato de su veredicto. Tocar un
   tamiz abre su ficha con las filas capturadas y su ciclo de vida (O1). CERO
   snake oil: todo número es salida determinista de autogenes/validacion.py y
   autogenes/nomos.py. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var elHero = document.getElementById('vl-hero');
    var elLattice = document.getElementById('vl-lattice');
    var elDetalle = document.getElementById('vl-detalle');
    var elLedger = document.getElementById('vl-ledger');
    var elVerif = document.getElementById('vl-verificadas');
    var CV = window.CicloVida;
    var datos = null;      // salida de /validacion
    var nomos = null;      // salida de /nomos (overlay del operador)
    var activa = null;     // clave del tamiz seleccionado

    // `esc` vive en gestell_comun.js (H14): una sola casa, y esa sí
    // escapa la comilla simple — la copia local no lo hacía.
    var esc = GestellComun.esc;
    function num(n) {
      return n == null ? '—' : Number(n).toLocaleString('es-MX');
    }
    function corta(s, n) {
      s = String(s == null ? '' : s);
      return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }
    function pesos(m) {
      return '$' + Number(m).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    }

    // ── hero: conformidad monumental + retícula (una celda por fila) ────
    function pintarHero() {
      if (!datos) return;
      var pct = datos.conformidad_pct;
      var ret = datos.reticula || { pasa: 0, observado: 0, rechazado: 0, total: 0 };
      var total = ret.total || 0;
      var cap = 300, cp = ret.pasa, co = ret.observado, cr = ret.rechazado, nota;
      if (total > cap) {
        var e = total / cap;
        cp = Math.round(ret.pasa / e); co = Math.round(ret.observado / e);
        cr = Math.round(ret.rechazado / e);
        nota = 'Cada celda ≈ ' + Math.round(e) + ' filas.';
      }
      var celdas = '';
      var i;
      for (i = 0; i < cp; i++) celdas += '<i></i>';
      for (i = 0; i < co; i++) celdas += '<i class="obs"></i>';
      for (i = 0; i < cr; i++) celdas += '<i class="rech"></i>';
      var sub = total
        ? num(ret.pasa) + ' de ' + num(total) + ' filas sin una sola ' +
          'observación. ' + (nota || 'La celda es la prueba, fila por fila.')
        : 'Sin filas aduanales — la conformidad nace con la sesión.';
      elHero.innerHTML =
        '<div>' +
          '<div class="big">' + (pct == null ? '—' : pct) +
            '<span class="u">%</span></div>' +
          '<div class="lbl">Filas plenamente conformes</div>' +
          '<div class="sub">' + sub + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="vl-ret" aria-hidden="true">' + celdas + '</div>' +
          '<div class="vl-ley">' +
            '<span class="k"><span class="sw pasa"></span>Pasa <b>' +
              num(ret.pasa) + '</b></span>' +
            '<span class="k"><span class="sw obs"></span>Observado <b>' +
              num(ret.observado) + '</b></span>' +
            '<span class="k"><span class="sw rech"></span>Rechazado <b>' +
              num(ret.rechazado) + '</b></span>' +
          '</div>' +
        '</div>';
    }

    // ── el lattice: los tamices de norma como filtración del universo ───
    function tamices() {
      // cuatro cuadrantes (capa × riel) + los tamices sin captura (colapso)
      var q = { rd: [], rp: [], od: [], op: [] };
      (datos.reglas || []).forEach(function (r) {
        if (r.n <= 0) return;
        var cap = r.veredicto === 'rechazado' ? 'r' : 'o';
        var riel = r.fuente === 'dwh' ? 'd' : 'p';
        q[cap + riel].push({
          clave: r.clave, titulo: r.titulo, norma: r.norma, n: r.n, base: r.base,
          cap: r.veredicto, estado: r.estado, contradice: r.contradice,
          nomos: false, side: r.fuente === 'dwh' ? 'l' : 'r'
        });
      });
      var conf = (datos.reglas || []).filter(function (r) { return r.n === 0; });
      // NOMOS activa (O5.1): con violaciones → estrato rechazado, riel DWH
      var nreglas = (nomos && nomos.reglas) || [];
      var nconf = [];
      nreglas.forEach(function (e) {
        if (!e.activa) return;                 // inactiva = backtest, no norma viva
        if (e.n_violaciones > 0) {
          q.rd.push({
            clave: 'nomos:' + e.id, titulo: e.nombre, n: e.n_violaciones,
            base: e.base, cap: 'rechazado', pnl: e.pnl_mxn, nomos: true,
            side: 'l', estado: e.estado, contradice: e.contradice
          });
        } else {
          nconf.push(e);
        }
      });
      return { q: q, conf: conf, nconf: nconf };
    }

    function dibujarLattice() {
      if (!elLattice || !datos) return;
      var cd = (datos.conformidad || {}).dwh || { base: 0, rechazado: 0, pasa: 0 };
      var cp = (datos.conformidad || {}).pdf || { base: 0, rechazado: 0, pasa: 0 };
      if (!cd.base && !cp.base) {
        elLattice.innerHTML = '<p class="qa-base-hint" style="padding:14px">' +
          'Sin filas aduanales — el lattice nace con la sesión.</p>';
        return;
      }
      var t = tamices();
      var W = 920, RL = 430, RR = 620;
      var LBL_L = 254, BRANCH_L = 262, LBL_R = 712, BRANCH_R = 704;
      var ROW = 52, NODE_H = 36;
      var s = '', y;

      function estratoLabel(txt, yy) {
        return '<text class="ll-sv-estrato" x="24" y="' + yy + '">' + txt + '</text>';
      }
      function dashed(yy) {
        return '<line class="ll-estrato" x1="24" y1="' + yy + '" x2="' +
          (W - 24) + '" y2="' + yy + '"/>';
      }
      function subVal(tz) {
        return esc(corta(tz.norma, 24)) + ' · <tspan class="ll-cap-' +
          (tz.cap === 'rechazado' ? 'r' : 'o') + '">|V| = ' + tz.n + '</tspan>';
      }
      function subNomos(tz) {
        var p = tz.pnl != null ? ' · <tspan class="ll-pnl">' + pesos(tz.pnl) +
          '</tspan>' : '';
        return 'regla del operador · <tspan class="ll-cap-r">|V| = ' + tz.n +
          '</tspan>' + p;
      }
      function tamiz(tz, cy) {
        var izq = tz.side === 'l';
        var railX = izq ? RL : RR;
        var inner = izq ? BRANCH_L : BRANCH_R;
        var lblX = izq ? LBL_L : LBL_R;
        var anchor = izq ? 'end' : 'start';
        var cerrado = (tz.estado === 'resuelto' || tz.estado === 'descartado') &&
          tz.clave !== activa && !tz.contradice;
        var gh = cerrado ? ' ll-ghost' : '';
        var foco = tz.clave === activa ? ' foco' : '';
        var dia = tz.cap === 'rechazado' ? 'll-dia-r' : 'll-dia-o';
        var badge = tz.nomos ? ' <tspan class="ll-nomos">·NOMOS·</tspan>' : '';
        var marca = tz.contradice ? ' <tspan class="ll-cap-r">≠</tspan>' : '';
        var sub = tz.nomos ? subNomos(tz) : subVal(tz);
        // el área clicable cubre etiqueta + rama + rombo (toda la fila)
        var hx = izq ? 30 : RR - 8;
        var hw = izq ? (RL + 8 - 30) : (W - 24 - (RR - 8));
        var o = '<line x1="' + railX + '" y1="' + cy + '" x2="' + inner + '" y2="' +
          cy + '" class="ll-rama' + gh + '"/>';
        o += '<path d="M' + railX + ' ' + (cy - 5) + ' L' + (railX + 5) + ' ' + cy +
          ' L' + railX + ' ' + (cy + 5) + ' L' + (railX - 5) + ' ' + cy +
          ' Z" class="' + dia + gh + '"/>';
        o += '<g class="ll-est' + foco + gh + '" role="button" tabindex="0" ' +
          'data-clave="' + esc(tz.clave) + '" aria-label="' + esc(tz.titulo) +
          ', ' + tz.n + ' filas, ' + tz.cap + '">';
        o += '<rect class="ll-hit" x="' + hx + '" y="' + (cy - 16) + '" width="' +
          hw + '" height="32"/>';
        o += '<text class="ll-regla" x="' + lblX + '" y="' + (cy - 3) +
          '" text-anchor="' + anchor + '">' + esc(corta(tz.titulo, 32)) +
          badge + marca + '</text>';
        o += '<text class="ll-sub" x="' + lblX + '" y="' + (cy + 11) +
          '" text-anchor="' + anchor + '">' + sub + '</text>';
        o += '</g>';
        return o;
      }
      function flujo(val, yy, rail) {
        var x = (rail === 'd' ? RL : RR) + 10;
        return '<text class="ll-flujo" x="' + x + '" y="' + yy + '">' + val + '</text>';
      }
      function estrato(left, right, startY) {
        var rows = Math.max(left.length, right.length);
        var out = '';
        for (var k = 0; k < rows; k++) {
          var cy = startY + k * ROW;
          if (left[k]) out += tamiz(left[k], cy);
          if (right[k]) out += tamiz(right[k], cy);
        }
        return { svg: out, endY: startY + Math.max(rows, 1) * ROW };
      }

      // ── ⊤ universo ──
      s += '<rect class="ll-nodo-u" x="220" y="20" width="480" height="' + NODE_H +
        '" rx="6"/>';
      s += '<text class="ll-t" x="236" y="43">⊤ · U — universo de la sesión</text>';
      s += '<text class="ll-n" x="684" y="43" text-anchor="end">DWH ' + cd.base +
        ' · PDF ' + cp.base + '</text>';
      var bodyY = 56;

      // los tamices se dibujan primero para conocer la altura; luego rieles.
      var body = '';
      y = 100;
      body += estratoLabel('RECHAZADO — GLOSA SEGURA', y);
      body += dashed(y + 8);
      body += flujo(cd.base, y - 4, 'd') + flujo(cp.base, y - 4, 'p');
      var rech = estrato(t.q.rd, t.q.rp, y + 42);
      body += rech.svg;
      y = rech.endY + 12;

      body += estratoLabel('OBSERVADO — A REVISAR', y);
      body += dashed(y + 8);
      body += flujo(cd.base - cd.rechazado, y - 4, 'd') +
        flujo(cp.base - cp.rechazado, y - 4, 'p');
      var obs = estrato(t.q.od, t.q.op, y + 42);
      body += obs.svg;
      y = obs.endY + 12;

      // ── tamices sin captura (V = ∅): el colapso de la conformidad ──
      var nConf = t.conf.length + t.nconf.length;
      var sincapY = y + 8;
      body += estratoLabel('TAMICES SIN CAPTURA', y);
      body += dashed(sincapY);
      var titulos = t.conf.slice(0, 4).map(function (r) { return r.titulo; });
      if (t.nconf.length) {
        titulos.push(t.nconf.length + ' del operador');
      }
      var extra = nConf - Math.min(t.conf.length, 4) -
        (t.nconf.length ? t.nconf.length : 0);
      var colapso = nConf
        ? nConf + ' tamices con V = ∅ — ' +
          titulos.map(function (x) { return corta(x, 22); }).join(' · ') +
          (extra > 0 ? ' · +' + extra + ' más' : '')
        : 'ningún tamiz sin captura — toda regla encontró algo';
      var cy2 = sincapY + 26;
      body += '<rect class="ll-mask" x="60" y="' + (cy2 - 12) + '" width="' +
        (W - 120) + '" height="18"/>';
      body += '<text class="ll-limpio" x="' + (W / 2) + '" y="' + cy2 +
        '" text-anchor="middle">' + esc(colapso) + '</text>';
      y = cy2 + 20;

      // flujo final + ⊥ conforme
      body += flujo(cd.pasa, y, 'd') + flujo(cp.pasa, y, 'p');
      var botY = y + 10;
      body += '<rect class="ll-nodo-p" x="220" y="' + botY + '" width="480" height="' +
        NODE_H + '" rx="6"/>';
      body += '<text class="ll-p" x="236" y="' + (botY + 23) +
        '">⊥ = ⋂ V̄ᵣ — plenamente conforme</text>';
      body += '<text class="ll-n" x="684" y="' + (botY + 23) +
        '" text-anchor="end">' + cd.pasa + ' DWH · ' + cp.pasa + ' PDF · ' +
        (datos.conformidad_pct == null ? '—' : datos.conformidad_pct + '%') +
        '</text>';
      var H = botY + NODE_H + 16;

      // rieles: de ⊤ a ⊥ (acento). La máscara del colapso corta visualmente.
      var rieles =
        '<line class="ll-riel" x1="' + RL + '" y1="' + bodyY + '" x2="' + RL +
          '" y2="' + botY + '"/>' +
        '<line class="ll-riel" x1="' + RR + '" y1="' + bodyY + '" x2="' + RR +
          '" y2="' + botY + '"/>';

      var defs = '<defs><filter id="ll-glow" x="-40%" y="-40%" width="180%" ' +
        'height="180%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge>' +
        '<feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

      elLattice.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="cd-svg" ' +
        'role="group" aria-label="Lattice de conformidad">' + defs + rieles + s +
        body + '</svg>';

      elLattice.querySelectorAll('.ll-est').forEach(function (g) {
        function abrir() { seleccionar(g.dataset.clave); }
        g.addEventListener('click', abrir);
        g.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); }
        });
      });
    }

    function seleccionar(clave) {
      activa = clave;
      dibujarLattice();
      pintarFicha(clave);
    }

    // ── ficha: el tamiz seleccionado, sus filas y su ciclo de vida ──────
    function pintarFicha(clave) {
      if (clave && clave.indexOf('nomos:') === 0) { return pintarFichaNomos(clave); }
      var rg = (datos.reglas || []).find(function (r) { return r.clave === clave; });
      if (!rg) return;
      var cap = rg.veredicto === 'rechazado' ? 'rechazado' : 'observado';
      var html = '<span class="cn-ficha-clase">' + esc(rg.fuente) + ' · ' + cap +
        '</span>' +
        '<h3 style="margin:2px 0 2px">' + esc(rg.titulo) + '</h3>' +
        '<div class="cn-ficha-monto' + (rg.n ? '' : ' neutro') + '">' +
        (rg.n ? rg.n + ' / ' + num(rg.base) : 'conforme') + '</div>' +
        '<p class="qa-base-hint" style="margin:0 0 8px">' + esc(rg.norma) + '</p>';
      if (rg.n) {
        html += '<div class="cv-vida">' + CV.seg(rg.clave, rg.estado) +
          CV.traza(rg) + '</div>' + CV.contra(rg);
        html += '<div class="qa-sec">Filas capturadas</div><div class="qa-lista">';
        rg.refs.forEach(function (r) {
          var partes = [];
          if (r.factura) partes.push('factura <b>' + esc(r.factura) + '</b>');
          if (r.chasis) partes.push('chasis ' + window.vinChip(r.chasis));
          if (r.filename) partes.push('PDF <b>' + esc(r.filename) + '</b>');
          html += '<div class="cn-ref"><span>' +
            (partes.join(' · ') || 'fila sin identificadores') + '</span></div>';
        });
        if (rg.n > rg.refs.length) {
          html += '<p class="qa-base-hint">+' + (rg.n - rg.refs.length) +
            ' más — el conteo SÍ las incluye.</p>';
        }
        html += '</div>';
      } else {
        html += '<p class="qa-base-hint">Ninguna fila cae en este tamiz — ' +
          'conformidad probada sobre ' + num(rg.base) + ' filas.</p>';
      }
      elDetalle.innerHTML = html;
    }

    function pintarFichaNomos(clave) {
      var id = clave.slice('nomos:'.length);
      var e = ((nomos && nomos.reglas) || []).find(function (x) {
        return String(x.id) === id;
      });
      if (!e) return;
      var html = '<span class="cn-ficha-clase">operador · NOMOS</span>' +
        '<h3 style="margin:2px 0 2px">' + esc(e.nombre) + '</h3>' +
        '<div class="cn-ficha-monto">' + e.n_violaciones + ' / ' + num(e.base) +
        '</div>' +
        '<p class="qa-base-hint" style="margin:0 0 8px">Regla del operador: ' +
        'debe cumplir <b>' + esc(e.entonces.campo) + ' = ' + esc(e.entonces.valor) +
        '</b>' + (e.pnl_mxn != null ? '. P&amp;L en riesgo: <b>' + pesos(e.pnl_mxn) +
        ' MXN</b>' : '') + '.</p>';
      html += '<div class="qa-sec">Filas capturadas</div><div class="qa-lista">';
      (e.refs || []).forEach(function (r) {
        var partes = [];
        if (r.factura) partes.push('factura <b>' + esc(r.factura) + '</b>');
        if (r.chasis) partes.push('chasis <b>' + esc(r.chasis) + '</b>');
        html += '<div class="cn-ref"><span>' +
          (partes.join(' · ') || 'fila sin identificadores') + '</span></div>';
      });
      html += '</div><p class="qa-base-hint">Esta regla vive en NOMOS; ' +
        'dispón su ciclo allí. <a href="/autogenes/nomos">abrir NOMOS →</a></p>';
      elDetalle.innerHTML = html;
    }

    // ── gestión: ledger de triaje + resoluciones verificadas ────────────
    function pintarGestion() {
      elLedger.innerHTML = CV.ledger(datos.estados || {}, 0);
      var glosa = {};
      (datos.reglas || []).forEach(function (rg) { glosa[rg.clave] = rg.titulo; });
      elVerif.innerHTML = CV.verificadas(datos.resoluciones_verificadas, glosa);
    }

    function pintarTodo() {
      pintarHero();
      dibujarLattice();
      pintarGestion();
      if (activa) pintarFicha(activa);
    }

    function recargar() {
      GestellComun.fetchUltimo('validacion', '/api/v1/autogenes/validacion')
        .then(function (j) {
          if (!j || j.error) return;
          datos = j;
          pintarTodo();
        });
    }

    // el ciclo de vida se dispone desde la ficha (delegación de eventos)
    CV.conectar(elDetalle, 'validacion', recargar);

    var btnExport = document.getElementById('vl-export');
    if (btnExport) btnExport.addEventListener('click', function () {
      if (!datos) return;
      CV.exportarCSV('VLD-02 · VALIDACIÓN', datos.session_id,
        ['clave', 'fuente', 'veredicto', 'titulo', 'base', 'violaciones', 'norma'],
        (datos.reglas || []).map(function (r) {
          return [r.clave, r.fuente, r.veredicto, r.titulo, r.base, r.n, r.norma];
        }), 'validacion',
        'todas las reglas evaluadas — salida determinista del motor');
    });

    if (window.Control) window.Control.montar('vl-control');

    // ── expediente certificado: la conformidad viva como producto ───────
    var btnCert = document.getElementById('vl-certificar');
    if (btnCert) btnCert.addEventListener('click', function () {
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

    // ── arranque: validación + NOMOS en paralelo, luego el lattice ──────
    Promise.all([
      GestellComun.fetchUltimo('validacion_inicio', '/api/v1/autogenes/validacion'),
      GestellComun.fetchUltimo('nomos_inicio', '/api/v1/autogenes/nomos')
        .catch(function () { return null; })
    ]).then(function (res) {
      var j = res[0];
      if (!j || j.error) {
        elLattice.innerHTML = '<p class="qa-base-hint" style="padding:14px">' +
          esc((j && j.error) || 'Sin datos') + '</p>';
        return;
      }
      datos = j;
      nomos = res[1] && !res[1].error ? res[1] : null;
      pintarTodo();
    }).catch(function () {
      elLattice.innerHTML = '<p class="qa-base-hint" style="padding:14px">' +
        'Sin conexión con el sustrato.</p>';
    });
  });
})();
