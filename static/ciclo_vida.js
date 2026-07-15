/* GNOSIS · CICLO DE VIDA (O1) — la capa de disposición compartida por
   CONCILIA (F9) y VALIDACIÓN (F10). Cada hallazgo/regla se dispone
   nuevo→en_gestion→resuelto/descartado por su clave; la escritura pasa por
   /api/v1/autogenes/<motor>/disponer (puerta única Sustrato + bitácora WORM).
   El motor re-deriva vivo y contrasta: un cerrado que sigue midiéndose se
   marca contradicho (magenta legítimo). Cero número inventado: el ledger
   suma sólo montos reales del motor. */
window.CicloVida = (function () {
  'use strict';

  var ESTADOS = [
    { k: 'nuevo', lbl: 'Sin disponer' },
    { k: 'en_gestion', lbl: 'En gestión' },
    { k: 'resuelto', lbl: 'Resuelto', term: true },
    { k: 'descartado', lbl: 'Descartado', term: true }
  ];
  var CERRADOS = { resuelto: 1, descartado: 1 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dinero(m) {
    return m == null ? null : '$' +
      Number(m).toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' MXN';
  }

  // ── severidad como chip etiquetado (no depende del color) ──────────
  function sevChip(sev) {
    var crit = sev === 'danger';
    return '<span class="cv-sev' + (crit ? ' crit' : '') + '">' +
      '<span class="d"></span>' + (crit ? 'Crítico' : 'Revisar') + '</span>';
  }

  // ── control segmentado del ciclo de vida ───────────────────────────
  function seg(clave, estado) {
    estado = estado || 'nuevo';
    return '<div class="cv-seg" data-clave="' + esc(clave) + '" data-estado="' +
      esc(estado) + '">' + ESTADOS.map(function (e) {
        var on = e.k === estado;
        return '<button type="button" class="cv-paso' + (e.term ? ' term' : '') +
          (on ? ' on' + (e.term ? ' cerrado' : '') : '') + '" data-estado="' +
          e.k + '">' + e.lbl + '</button>';
      }).join('') + '</div>';
  }

  // ── traza de procedencia + afordancia de nota ──────────────────────
  function traza(h) {
    var disp = h.estado && h.estado !== 'nuevo';
    if (disp && h.nota) {
      return '<span class="cv-traza"><span class="op">operador</span> · ' +
        '<button type="button" class="cv-nota-edit nt">"' + esc(h.nota) +
        '"</button></span>';
    }
    return '<button type="button" class="cv-nota-add">+ nota</button>';
  }

  // ── banda de contradicción (único magenta legítimo del ciclo) ──────
  function contra(h) {
    if (!h.contradice) return '';
    return '<div class="cv-contra"><span class="mk">≠</span>' +
      '<span class="tx"><b>Marcado ' + esc(h.estado) + ', pero el motor lo ' +
      'sigue midiendo</b> sobre los datos vivos. La discrepancia no ha ' +
      'desaparecido — corrige el origen o revierte la disposición.</span></div>';
  }

  // ── ledger de gestión: el foco de triaje ───────────────────────────
  // estados: {nuevo,en_gestion,resuelto,descartado,contradice}
  // riesgoSinDisponer: suma de montos reales de los hallazgos 'nuevo'
  function ledger(estados, riesgoSinDisponer) {
    var sin = estados.nuevo || 0;
    var ges = estados.en_gestion || 0;
    var cer = (estados.resuelto || 0) + (estados.descartado || 0);
    var total = sin + ges + cer;
    if (!total) return '';
    function pct(n) { return (100 * n / total).toFixed(1); }
    var riesgo = riesgoSinDisponer > 0 ? dinero(riesgoSinDisponer) : null;
    var alerta = estados.contradice
      ? '<div class="cv-alerta"><span class="chip"><span class="mk">≠</span>' +
        estados.contradice + ' contradicho' + (estados.contradice > 1 ? 's' : '') +
        '</span></div>'
      : '';
    return '<div class="cv-ledger">' +
      '<div class="triage">' +
        '<div class="meter">' +
          '<i class="sin" style="width:' + pct(sin) + '%"></i>' +
          '<i class="ges" style="width:' + pct(ges) + '%"></i>' +
          '<i class="cer" style="width:' + pct(cer) + '%"></i>' +
        '</div>' +
        '<div class="leyenda">' +
          '<span><span class="dot sin"></span>Sin disponer <b>' + sin + '</b></span>' +
          '<span><span class="dot ges"></span>En gestión <b>' + ges + '</b></span>' +
          '<span><span class="dot cer"></span>Cerrados <b>' + cer + '</b></span>' +
        '</div>' +
        (riesgo ? '<div class="pend">Aún sin disponer: <b>' + riesgo +
          '</b> en riesgo sobre la mesa.</div>' : '') +
      '</div>' + alerta + '</div>';
  }

  // ── filtro por estado ──────────────────────────────────────────────
  function filtros(estados, activo) {
    var total = (estados.nuevo || 0) + (estados.en_gestion || 0) +
      (estados.resuelto || 0) + (estados.descartado || 0);
    var defs = [
      { k: 'todos', lbl: 'Todos', n: total },
      { k: 'nuevo', lbl: 'Sin disponer', n: estados.nuevo || 0 },
      { k: 'en_gestion', lbl: 'En gestión', n: estados.en_gestion || 0 },
      { k: 'resuelto', lbl: 'Resueltos', n: estados.resuelto || 0 },
      { k: 'descartado', lbl: 'Descartados', n: estados.descartado || 0 },
      { k: 'contradice', lbl: 'Contradichos', n: estados.contradice || 0, alerta: true }
    ];
    return '<div class="cv-filtros">' + defs.map(function (d) {
      if (d.k === 'contradice' && !d.n) return '';
      return '<button type="button" class="cv-filtro' +
        (d.alerta ? ' alerta' : '') + (d.k === activo ? ' on' : '') +
        '" data-filtro="' + d.k + '">' + d.lbl +
        ' <span class="n">' + d.n + '</span></button>';
    }).join('') + '</div>';
  }

  function pasa(h, filtro) {
    if (filtro === 'todos') return true;
    if (filtro === 'contradice') return !!h.contradice;
    return (h.estado || 'nuevo') === filtro;
  }

  // ── resoluciones verificadas por el motor ──────────────────────────
  function verificadas(lista, glosa) {
    if (!lista || !lista.length) return '';
    return '<div class="cv-verif"><h4>Resueltos y verificados por el motor ' +
      '<span class="n">' + lista.length + '</span></h4>' +
      '<p>Los marcaste resueltos y el motor ya no los mide: la discrepancia ' +
      'desapareció de los datos vivos. La resolución quedó probada, no supuesta.</p>' +
      lista.map(function (v) {
        return '<div class="item"><span class="ck">✓</span>' +
          '<span class="k">' + esc(v.clave) + '</span>' +
          '<span>' + esc(glosa && glosa[v.clave] ? glosa[v.clave] : v.clave) +
          ' — ya no aparece</span>' +
          '<span class="m">operador' + (v.nota ? ' · "' + esc(v.nota) + '"' : '') +
          '</span></div>';
      }).join('') + '</div>';
  }

  // ── POST a la puerta única ─────────────────────────────────────────
  function disponer(motor, clave, estado, nota, onDone, onErr) {
    var body = { clave: clave, estado: estado };
    if (nota !== undefined) body.nota = nota;
    fetch('/api/v1/autogenes/' + motor + '/disponer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { if (onErr) onErr(res.j.error || 'No se pudo disponer'); return; }
        if (onDone) onDone(res.j);
      })
      .catch(function () { if (onErr) onErr('Sin conexión'); });
  }

  // ── delegación de eventos sobre el contenedor de la lista ──────────
  // motor: 'concilia'|'validacion'; onDone(): recarga+re-render.
  function conectar(contenedor, motor, onDone) {
    contenedor.addEventListener('click', function (ev) {
      var paso = ev.target.closest('.cv-paso');
      if (paso) {
        var seg1 = paso.closest('.cv-seg');
        disponer(motor, seg1.dataset.clave, paso.dataset.estado, undefined,
          onDone, onDone);
        return;
      }
      var add = ev.target.closest('.cv-nota-add');
      var edit = ev.target.closest('.cv-nota-edit');
      if (add || edit) {
        abrirNota(ev.target.closest('.cv-vida'), motor, onDone);
      }
    });
  }

  // inline: reemplaza la afordancia por un input; guarda con el estado vivo
  function abrirNota(vida, motor, onDone) {
    if (!vida) return;
    var seg2 = vida.querySelector('.cv-seg');
    var clave = seg2.dataset.clave, estado = seg2.dataset.estado;
    var actual = vida.querySelector('.cv-traza, .cv-nota-add');
    var prev = '';
    var ntBtn = vida.querySelector('.cv-nota-edit');
    if (ntBtn) prev = ntBtn.textContent.replace(/^"|"$/g, '');
    var caja = document.createElement('span');
    caja.className = 'cv-nota-edicion';
    caja.innerHTML = '<input type="text" class="cv-nota-in" maxlength="240" ' +
      'placeholder="nota para la bitácora"> ' +
      '<button type="button" class="cv-nota-ok">guardar</button>';
    if (actual) actual.replaceWith(caja);
    var input = caja.querySelector('.cv-nota-in');
    input.value = prev;
    input.focus();
    function guardar() {
      disponer(motor, clave, estado, input.value.trim() || null, onDone, onDone);
    }
    caja.querySelector('.cv-nota-ok').addEventListener('click', guardar);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); guardar(); }
    });
  }

  return {
    ESTADOS: ESTADOS, CERRADOS: CERRADOS, esc: esc, dinero: dinero,
    sevChip: sevChip, seg: seg, traza: traza, contra: contra, ledger: ledger,
    filtros: filtros, pasa: pasa, verificadas: verificadas,
    disponer: disponer, conectar: conectar
  };
})();
