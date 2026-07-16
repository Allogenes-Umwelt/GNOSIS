/* GNOSIS · NOMOS (F12, NMS-04) — reglas del caso con P&L real.
   Izquierda: reglas monetizadas (precios presentes; lo sin precio se
   declara). Derecha: el diagrama de decisión de la regla seleccionada
   — internamente una unidad umbral McCulloch-Pitts (AND, pesos
   unitarios fijos), pero TODA copia visible es de negocio: condiciones
   → filas que caen → cumplen/violan lo esperado. CERO snake oil: cada
   número es |conjunto| del motor. Datos: /api/v1/autogenes/nomos. */
(function () {
  'use strict';

  var CAMPOS = ['pais_code', 'j_y_n', 'auto_code', 'factura', 'chasis'];

  document.addEventListener('DOMContentLoaded', function () {
    var elReglas = document.getElementById('nm-reglas');
    var elRefs = document.getElementById('nm-refs');
    var elLedger = document.getElementById('nm-ledger');
    var elVerif = document.getElementById('nm-verificadas');
    var lienzo = document.getElementById('nm-lienzo');
    var canvas = lienzo && lienzo.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');
    var CV = window.CicloVida;
    var datos = null;
    var activo = -1;
    var activaId = null;      // la regla seleccionada, por id (sobrevive el re-rank)
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

    // ── el diagrama M-P de la regla seleccionada ─────────────────────
    function dibujarNeurona() {
      if (!ctx) return;
      leerColores();
      tamano();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.font = '10px ' + colores.mono;
      if (activo < 0 || !datos || !datos.reglas[activo]) {
        ctx.fillStyle = colores.t3;
        ctx.textAlign = 'center';
        ctx.fillText('TOCA UNA REGLA PARA VER CÓMO DECIDE', w / 2, h / 2);
        return;
      }
      var rg = datos.reglas[activo];
      var ins = rg.entradas;
      var xIn = 16, xSum = w * 0.46, xThr = w * 0.72, xOut = w - 14;
      var ySum = h * 0.44;
      var pasoY = ins.length > 1 ? (h * 0.62) / (ins.length - 1) : 0;
      var y0 = ins.length > 1 ? h * 0.14 : ySum;

      // entradas: condición + conteo vivo, arista con peso unitario
      ins.forEach(function (c, i) {
        var y = y0 + i * pasoY;
        ctx.strokeStyle = alfa(colores.acc, 0.85);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(xIn + 4, y);
        ctx.lineTo(xSum - 22, ySum + (y - ySum) * 0.18);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = colores.t1;
        ctx.textAlign = 'left';
        ctx.fillText(c.campo + ' = ' + c.valor, xIn, y - 14);
        ctx.fillStyle = colores.t3;
        ctx.fillText(c.n + ' filas', xIn, y - 3);

      });

      // Σ
      ctx.beginPath();
      ctx.arc(xSum, ySum, 20, 0, 6.283);
      ctx.strokeStyle = colores.acc;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = colores.t1;
      ctx.font = '700 16px ' + colores.mono;
      ctx.textAlign = 'center';
      ctx.fillText('Σ', xSum, ySum + 5);

      // umbral θ (la caja escalón)
      ctx.strokeStyle = alfa(colores.acc, 0.85);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(xSum + 20, ySum); ctx.lineTo(xThr - 18, ySum);
      ctx.stroke();
      ctx.strokeRect(xThr - 18, ySum - 16, 36, 32);
      ctx.beginPath();                                 // el escalón
      ctx.moveTo(xThr - 10, ySum + 8); ctx.lineTo(xThr, ySum + 8);
      ctx.lineTo(xThr, ySum - 8); ctx.lineTo(xThr + 10, ySum - 8);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = colores.t3;
      ctx.font = '10px ' + colores.mono;
      ctx.fillText(rg.umbral === 1 ? 'la condición' : 'las ' + rg.umbral +
                   ' a la vez', xThr, ySum + 30);

      // salida: disparos y, de esos, violaciones en magenta
      ctx.strokeStyle = alfa(colores.acc, 0.85);
      ctx.lineWidth = 1.6;
      // la línea muere ANTES de las etiquetas: el texto nunca se tacha
      ctx.beginPath(); ctx.moveTo(xThr + 18, ySum);
      ctx.lineTo(xOut - 128, ySum);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.textAlign = 'right';
      ctx.fillStyle = colores.t1;
      ctx.fillText(rg.n_disparos + ' caen en la regla', xOut, ySum - 26);
      ctx.fillStyle = colores.acc;
      ctx.fillText(rg.n_conformes + ' cumplen', xOut, ySum - 12);
      ctx.fillStyle = colores.danger;
      ctx.font = '700 12px ' + colores.mono;
      ctx.fillText(rg.n_violaciones + ' no cumplen', xOut, ySum + 6);
      ctx.font = '10px ' + colores.mono;
      ctx.fillStyle = colores.t3;
      ctx.fillText('esperado: ' + rg.entonces.campo + ' = ' +
                   rg.entonces.valor, xOut, ySum + 20);
    }

    function pintarGestion() {
      if (!CV) return;
      elLedger.innerHTML = CV.ledger(datos.estados || {}, 0);
      var glosa = {};
      datos.reglas.forEach(function (rg) { glosa[rg.clave || rg.id] = rg.nombre; });
      elVerif.innerHTML = CV.verificadas(datos.resoluciones_verificadas, glosa);
    }

    // ── izquierda: lista de reglas ───────────────────────────────────
    function pintarReglas() {
      pintarGestion();
      if (!datos.reglas.length) {
        elReglas.innerHTML = '<p class="qa-base-hint">Sin reglas declaradas — ' +
          'la primera nace abajo, o promovida desde un insight SINAPSIS.</p>';
        return;
      }
      var html = '';
      datos.reglas.forEach(function (rg, i) {
        var pnl = rg.pnl_mxn != null
          ? '$' + num(Math.round(rg.pnl_mxn)) + ' MXN' : 'sin monto';
        // ciclo de vida (O1): sólo las reglas incumplidas se disponen; una
        // cerrada que sigue incumpliéndose se marca contradicha (magenta)
        var cerrada = rg.estado === 'resuelto' || rg.estado === 'descartado';
        html += '<button type="button" class="cn-caja qa-item' +
          (i === activo ? ' activo' : '') + (rg.n_violaciones ? '' : ' vl-ok') +
          (rg.n_violaciones && rg.contradice ? ' contradicha'
            : (rg.n_violaciones && cerrada ? ' cerrada' : '')) +
          '" data-i="' + i + '">' +
          '<span class="clase">' + esc(rg.origen) +
          (rg.activa ? '' : ' · inactiva') +
          (rg.n_violaciones && rg.estado && rg.estado !== 'nuevo'
            ? ' · ' + esc(rg.estado.replace('_', ' ')) : '') +
          (rg.contradice ? ' <span class="nm-contra">≠</span>' : '') +
          '</span>' +
          '<span class="fila"><span class="titulo">' + esc(rg.nombre) + '</span>' +
          '<span class="monto' + (rg.n_violaciones ? '' : ' neutro') + '">' +
          (rg.n_violaciones ? pnl : 'en paz') + '</span></span>' +
          '<p class="detalle">' + num(rg.n_disparos) + ' de ' +
          num(rg.base) + ' filas caen en la regla · ' + rg.n_conformes +
          ' cumplen · ' + rg.n_violaciones + ' no cumplen' +
          (rg.sin_precio ? ' · ' + rg.sin_precio + ' sin precio (no se estima)' : '') +
          '</p></button>';
      });
      elReglas.innerHTML = html;
      elReglas.querySelectorAll('.cn-caja').forEach(function (btn) {
        btn.addEventListener('click', function () {
          activo = Number(btn.dataset.i);
          activaId = datos.reglas[activo] ? datos.reglas[activo].id : null;
          pintarReglas();
          pintarRefs();
          dibujarNeurona();
        });
      });
    }

    function pintarRefs() {
      var rg = datos.reglas[activo];
      if (!rg) {
        elRefs.innerHTML = '<p class="qa-base-hint">Toca una regla.</p>';
        return;
      }
      var html = '';
      // ciclo de vida (O1) en la ficha: sólo las reglas incumplidas se
      // disponen (una regla en paz no es un hallazgo que gestionar)
      if (rg.n_violaciones && CV) {
        html += '<div class="cv-vida">' + CV.seg(rg.clave || rg.id, rg.estado) +
          CV.traza(rg) + '</div>' + CV.contra(rg);
      }
      if (!rg.refs.length) {
        html += '<p class="qa-base-hint">Ninguna fila viola esta regla.</p>';
        elRefs.innerHTML = html;
        return;
      }
      rg.refs.forEach(function (r) {
        html += '<div class="cn-ref"><span>factura <b>' + esc(r.factura) +
          '</b> · chasis ' + window.vinChip(r.chasis) + '</span></div>';
      });
      if (rg.n_violaciones > rg.refs.length) {
        html += '<p class="qa-base-hint">+' + (rg.n_violaciones - rg.refs.length) +
          ' más — el P&L SÍ las incluye.</p>';
      }
      elRefs.innerHTML = html;
      cargarBacktest(rg);
    }

    // backtest: la misma regla contra toda la historia procesada.
    // Guard de secuencia: al cambiar de regla rápido, la respuesta lenta de
    // la regla anterior NO debe adjuntar su P&L bajo las refs de la nueva.
    var backtestId = null;
    function cargarBacktest(rg) {
      backtestId = rg.id;
      fetch('/api/v1/autogenes/nomos/backtest?id=' + encodeURIComponent(rg.id))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (backtestId !== rg.id) return;          // llegó tarde: descartar
          if (!j || j.error || !j.corridas) return;
          var html = '<div class="qa-sec">Backtest · toda la historia</div>' +
            '<div class="qa-lista">';
          j.corridas.forEach(function (c) {
            html += '<div class="cn-ref">' +
              '<span>' + esc(c.sesion) + (c.actual ? ' · actual' : '') +
              ' · ' + c.n_disparos + ' caen · <b>' + c.n_violaciones +
              ' no cumplen</b>' +
              (c.pnl_mxn != null ? ' · $' + num(Math.round(c.pnl_mxn)) + ' MXN'
                : '') + '</span></div>';
          });
          elRefs.insertAdjacentHTML('beforeend', html + '</div>');
        })
        .catch(function () {});
    }

    function cargar() {
      fetch('/api/v1/autogenes/nomos')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) {
            elReglas.innerHTML = '<p class="qa-base-hint">' +
              esc((j && j.error) || 'Sin datos') + '</p>';
            return;
          }
          datos = j;
          // la lista se re-rankea por P&L en cada carga: un índice viejo
          // apuntaría a OTRA regla — se reancla por id, no por posición, para
          // que disponer una regla no suelte la selección
          activo = activaId
            ? j.reglas.findIndex(function (r) { return r.id === activaId; })
            : -1;
          if (activo < 0) activaId = null;
          document.getElementById('nm-total').textContent = num(j.total);
          document.getElementById('nm-activas').textContent = num(j.activas);
          var v = document.getElementById('nm-violaciones');
          v.textContent = num(j.violaciones_activas);
          v.classList.toggle('riesgo', j.violaciones_activas > 0);
          var p = document.getElementById('nm-pnl');
          p.textContent = '$' + num(Math.round(j.pnl_activas_mxn));
          p.classList.toggle('riesgo', j.pnl_activas_mxn > 0);
          pintarReglas();
          pintarRefs();
          dibujarNeurona();
        })
        .catch(function () {
          elReglas.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
        });
    }

    // ── declarar regla ───────────────────────────────────────────────
    ['nm-c-campo', 'nm-e-campo'].forEach(function (id) {
      var sel = document.getElementById(id);
      CAMPOS.forEach(function (c) {
        var op = document.createElement('option');
        op.value = c; op.textContent = c;
        sel.appendChild(op);
      });
    });
    document.getElementById('nm-e-campo').value = 'j_y_n';

    // volante insight→regla (HITL): el insight siembra nombre y origen;
    // la lógica la declara el operador — jamás se auto-crea una regla
    var params = new URLSearchParams(location.search);
    var desdeInsight = params.get('desde') || '';
    if (params.get('nombre')) {
      document.getElementById('nm-nombre').value = params.get('nombre');
    }
    // O5.2: si el insight es campo=valor, llega la regla YA derivada — se
    // pre-llena condición y esperado (los selects ya tienen sus opciones);
    // el operador la revisa y la crea (HITL: nunca auto-creada)
    function sembrar(id, clave) {
      var v = params.get(clave);
      if (v) document.getElementById(id).value = v;
    }
    sembrar('nm-c-campo', 'c_campo');
    sembrar('nm-c-valor', 'c_valor');
    sembrar('nm-e-campo', 'e_campo');
    sembrar('nm-e-valor', 'e_valor');
    if (desdeInsight) {
      document.getElementById('nm-msj').textContent = params.get('c_valor')
        ? 'Regla derivada del insight — revísala y créala'
        : 'Promovida desde SINAPSIS — declara la condición y el esperado';
    }

    document.getElementById('nm-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msj = document.getElementById('nm-msj');
      msj.className = 'ag-msj';
      msj.textContent = 'Creando…';
      fetch('/api/v1/autogenes/nomos/regla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: document.getElementById('nm-nombre').value.trim(),
          condiciones: [{
            campo: document.getElementById('nm-c-campo').value,
            valor: document.getElementById('nm-c-valor').value.trim()
          }],
          entonces: {
            campo: document.getElementById('nm-e-campo').value,
            valor: document.getElementById('nm-e-valor').value.trim()
          },
          origen: desdeInsight ? 'insight' : 'operador'
        })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) {
            msj.className = 'ag-msj error';
            msj.textContent = res.j.error || 'No se pudo crear';
            return;
          }
          msj.textContent = 'Regla creada';
          document.getElementById('nm-form').reset();
          document.getElementById('nm-e-campo').value = 'j_y_n';
          cargar();
        })
        .catch(function () {
          msj.className = 'ag-msj error';
          msj.textContent = 'Sin conexión';
        });
    });

    if (canvas) {
      window.addEventListener('resize', dibujarNeurona);
      var alternador = document.getElementById('theme-toggle');
      if (alternador) alternador.addEventListener('click', function () {
        setTimeout(dibujarNeurona, 60);
      });
    }

    // el ciclo de vida (O1) se dispone desde la ficha (delegación de eventos);
    // al disponer, se recarga preservando la regla seleccionada por id
    if (CV) CV.conectar(elRefs, 'nomos', cargar);
    cargar();
  });
})();
