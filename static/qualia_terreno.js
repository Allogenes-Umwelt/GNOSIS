/* GNOSIS · Qualia — Terreno de anomalías (F7d, port de LienzoTerreno).
   El Marco como malla isométrica: en reposo yace plana y gris — ESA es
   la lectura (sin desviaciones contra tu referencia). Donde un detector
   disparó, la malla se abomba en magenta (--danger: alerta REAL): la
   altura de la cresta ES la severidad medida, y cada cresta es un nodo
   de dato — etiqueta permanente (detector · severidad) y tap para el
   porqué. Nueve epicentros fijos, uno por detector, marcados con puntos
   quietos para que la geografía se aprenda. Totalmente estático: sin
   barrido ni rotación — la deformación es la información (nada que
   congelar bajo reduced-motion). Determinista.
   Datos: /api/v1/autogenes/qualia/estado — jamás inventados. */
(function () {
  'use strict';

  var DETECTORES = [
    { id: 'hub-nuevo', etiqueta: 'HUBS',
      definicion: 'Concentrador nuevo: una entidad acumula muchas más conexiones que antes.' },
    { id: 'exponente', etiqueta: 'LEY',
      definicion: 'La distribución de conectividad cambió de régimen en todo el grafo.' },
    { id: 'puente-nuevo', etiqueta: 'PUENTES+',
      definicion: 'Apareció un puente crítico: el único camino entre dos regiones de tu red.' },
    { id: 'puente-caido', etiqueta: 'PUENTES−',
      definicion: 'Algo que era puente crítico dejó de serlo.' },
    { id: 'islas', etiqueta: 'ISLAS',
      definicion: 'Cambió el número de fragmentos desconectados: tu grafo se partió o se fusionó.' },
    { id: 'densidad', etiqueta: 'TEJIDO',
      definicion: 'La densidad de enlaces se apretó o se aflojó contra tu referencia.' },
    { id: 'rafaga', etiqueta: 'RÁFAGA',
      definicion: 'Actividad en ráfagas: mucho en poco tiempo frente a tu cadencia usual.' },
    { id: 'ritmo', etiqueta: 'RITMO',
      definicion: 'Tu cadencia se quebró: la actividad dejó de parecerse a sí misma.' },
    { id: 'fuente', etiqueta: 'FUENTES',
      definicion: 'Una serie externa guardada se desvió de su comportamiento (latente hasta que existan series).' }
  ];
  // rejilla de epicentros 3×3 en coordenadas de mundo [-1,1]²
  var EPICENTROS = DETECTORES.map(function (d, i) {
    return { id: d.id, etiqueta: d.etiqueta,
             x: ((i % 3) - 1) * 0.62, z: (Math.floor(i / 3) - 1) * 0.62 };
  });
  var COLS = 19, FILAS = 19, SIGMA2 = 2 * 0.16 * 0.16;

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qt-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var elInfo = document.getElementById('qt-info');
    var elDetalle = document.getElementById('qt-detalle');
    var elAnom = document.getElementById('qt-anomalias');
    var elDefs = document.getElementById('qt-detectores');
    var btnBase = document.getElementById('qt-base');
    var elMsj = document.getElementById('qt-msj');

    var colores = {};
    var estado = null;          // /qualia/estado
    var crestas = [];           // {x, z, altura, a}
    var posCrestas = [];        // posiciones en pantalla para el tap
    var seleccionada = null;    // clave de la anomalía activa

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function alfa(hex, a) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
             ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    function leerColores() {
      var cs = getComputedStyle(document.documentElement);
      colores = {
        acc: cs.getPropertyValue('--acc-text').trim() || '#00D4FF',
        danger: cs.getPropertyValue('--danger').trim() || '#F57F9C',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA'
      };
    }
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = Math.max(420, caja.height) * dpr;
      canvas.style.height = Math.max(420, caja.height) + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function etiquetaDe(detector) {
      var d = DETECTORES.find(function (x) { return x.id === detector; });
      return d ? d.etiqueta : detector.toUpperCase();
    }

    // una cresta por hallazgo en el epicentro de su detector (abanico
    // determinista cuando un detector sostiene varios)
    function construirCrestas() {
      var porDetector = {};
      (estado.hallazgos || []).forEach(function (a) {
        (porDetector[a.detector] = porDetector[a.detector] || []).push(a);
      });
      crestas = [];
      EPICENTROS.forEach(function (e) {
        var halladas = porDetector[e.id] || [];
        halladas.forEach(function (a, k) {
          var abanico = (k - (halladas.length - 1) / 2) * 0.18;
          crestas.push({
            x: e.x + abanico,
            z: e.z + (k % 2 === 0 ? 0 : 0.12),
            altura: 0.15 + 0.85 * a.severidad,
            a: a
          });
        });
      });
    }

    function dibujar() {
      if (!estado) return;
      tamano();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var cx = w / 2, cy = h * 0.56;
      var A = Math.min(w, h) * 0.36, B = A * 0.5, H = Math.min(w, h) * 0.34;

      function altura(x, z) {
        var s = 0;
        for (var i = 0; i < crestas.length; i++) {
          var c = crestas[i];
          var d2 = (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z);
          s += c.altura * Math.exp(-d2 / SIGMA2);
        }
        return Math.min(1.2, s);
      }
      function proy(x, z, y) {
        return [cx + (x - z) * A, cy + (x + z) * B - y * H];
      }

      ctx.clearRect(0, 0, w, h);

      // vértices, precomputados una vez por dibujo
      var V = [];
      for (var i = 0; i < COLS; i++) {
        V[i] = [];
        for (var j = 0; j < FILAS; j++) {
          var x = (i / (COLS - 1)) * 2 - 1;
          var z = (j / (FILAS - 1)) * 2 - 1;
          var y = altura(x, z);
          var p = proy(x, z, y);
          V[i][j] = { sx: p[0], sy: p[1], y: y };
        }
      }

      // malla (pintor: filas lejanas primero): chasis gris documental;
      // magenta donde el terreno se levanta — la alerta vive ahí
      function segmento(a, b) {
        var nivel = (a.y + b.y) / 2;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = alfa(colores.linea, 0.22);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (nivel > 0.04) {
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
          ctx.strokeStyle = alfa(colores.danger, Math.min(0.85, nivel));
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      for (var j2 = 0; j2 < FILAS; j2++) {
        for (var i2 = 0; i2 < COLS - 1; i2++) segmento(V[i2][j2], V[i2 + 1][j2]);
      }
      for (var i3 = 0; i3 < COLS; i3++) {
        for (var j3 = 0; j3 < FILAS - 1; j3++) segmento(V[i3][j3], V[i3][j3 + 1]);
      }

      // epicentros quietos: los detectores en reposo — geografía aprendible
      var activos = {};
      crestas.forEach(function (c) { activos[c.a.detector] = true; });
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      EPICENTROS.forEach(function (e) {
        if (activos[e.id]) return;
        var p = proy(e.x, e.z, altura(e.x, e.z));
        ctx.beginPath();
        ctx.arc(p[0], p[1], 1.5, 0, 6.283);
        ctx.fillStyle = alfa(colores.t3, 0.55);
        ctx.fill();
        ctx.fillStyle = alfa(colores.t3, 0.4);
        ctx.fillText(e.etiqueta, p[0], p[1] + 4);
      });

      // crestas: nodos de dato — ápice, etiqueta permanente, blanco de tap
      posCrestas = [];
      ctx.textBaseline = 'bottom';
      crestas.forEach(function (c) {
        var p = proy(c.x, c.z, altura(c.x, c.z));
        var sx = p[0], sy = p[1];
        posCrestas.push({ x: sx, y: sy, a: c.a });
        var esSel = seleccionada === c.a.clave;
        var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16);
        glow.addColorStop(0, alfa(colores.danger, esSel ? 0.7 : 0.4));
        glow.addColorStop(1, alfa(colores.danger, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(sx, sy, 16, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.arc(sx, sy, esSel ? 5 : 3.5, 0, 6.283);
        ctx.fillStyle = colores.danger; ctx.fill();
        if (esSel) {
          ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 6.283);
          ctx.strokeStyle = alfa(colores.danger, 0.6);
          ctx.lineWidth = 1; ctx.stroke();
        }
        var txt = etiquetaDe(c.a.detector) + ' ' + c.a.severidad.toFixed(2);
        var medio = ctx.measureText(txt).width / 2;
        var tx = Math.max(12 + medio, Math.min(w - 12 - medio, sx));
        ctx.fillStyle = esSel ? colores.t1 : alfa(colores.t1, 0.9);
        ctx.fillText(txt, tx, sy - 8);
      });

      // brackets de esquina (chasis del instrumento)
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
      [[8, 8, 22, 8, 8, 22], [w - 8, 8, w - 22, 8, w - 8, 22],
       [8, h - 8, 22, h - 8, 8, h - 22], [w - 8, h - 8, w - 22, h - 8, w - 8, h - 22]]
        .forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[4], c[5]); ctx.stroke();
        });
      ctx.globalAlpha = 1; ctx.lineWidth = 1;

      elInfo.textContent = crestas.length === 0
        ? (estado.base ? 'TERRENO PLANO · SIN DESVIACIONES CONTRA TU REFERENCIA'
                       : 'TERRENO PLANO · ' + (estado.motivo || 'SIN REFERENCIA').toUpperCase())
        : crestas.length + (crestas.length === 1 ? ' DEFORMACIÓN' : ' DEFORMACIONES') +
          ' · ALTURA = SEVERIDAD MEDIDA';
    }

    // ── ficha ────────────────────────────────────────────────────────
    function pintarDetalle(a) {
      if (!a) {
        elDetalle.innerHTML = '<p class="qa-base-hint">Toca una cresta para ver ' +
          'qué midió el detector y contra qué referencia.</p>';
        return;
      }
      var d = DETECTORES.find(function (x) { return x.id === a.detector; });
      elDetalle.innerHTML =
        '<div class="gr-kind">' + esc(etiquetaDe(a.detector)) + ' · SEVERIDAD ' +
        Math.round(a.severidad * 100) + '%</div>' +
        '<div class="gr-nombre">' + esc(a.titulo) + '</div>' +
        '<p class="qa-lectura">' + esc(a.detalle) + '</p>' +
        (d ? '<p class="qa-base-hint">' + esc(d.definicion) + '</p>' : '');
    }
    function pintarLista() {
      var html = '';
      (estado.hallazgos || []).forEach(function (a) {
        html += '<button type="button" class="qa-caja anomalia qa-item' +
          (seleccionada === a.clave ? ' activo' : '') + '" data-clave="' +
          esc(a.clave) + '"><span title="' + esc(a.detalle) + '">' +
          esc(a.titulo.slice(0, 30)) + '</span><b>' +
          Math.round(a.severidad * 100) + '%</b></button>';
      });
      if (!html) {
        html = estado.base
          ? '<p class="qa-base-hint">Sin desviaciones contra tu referencia — nada de placebo.</p>'
          : '<p class="qa-base-hint">' + esc(estado.motivo || 'Sin referencia fijada.') + '</p>';
      }
      elAnom.innerHTML = html;
      elAnom.querySelectorAll('.qa-item').forEach(function (b) {
        b.addEventListener('click', function () {
          seleccionar(b.getAttribute('data-clave'));
        });
      });
    }
    function pintarDefs() {
      var html = '';
      DETECTORES.forEach(function (d) {
        html += '<div class="qa-caja" title="' + esc(d.definicion) + '">' +
          '<span>' + esc(d.etiqueta) + '</span></div>';
      });
      elDefs.innerHTML = html;
    }
    function seleccionar(clave) {
      seleccionada = seleccionada === clave ? null : clave;
      var a = (estado.hallazgos || []).find(function (x) { return x.clave === seleccionada; });
      pintarDetalle(a || null);
      pintarLista();
      dibujar();
    }

    // ── datos ────────────────────────────────────────────────────────
    var reqSeq = 0;
    function cargar() {
      var mia = ++reqSeq;
      fetch('/api/v1/autogenes/qualia/estado')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (mia !== reqSeq) return;
          if (!j || j.error) {
            elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase();
            return;
          }
          estado = j;
          construirCrestas();
          btnBase.textContent = estado.base ? 'refijar base' : 'fijar base';
          pintarLista();
          pintarDefs();
          dibujar();
        })
        .catch(function () {
          elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
        });
    }

    canvas.addEventListener('pointerup', function (ev) {
      var caja = canvas.getBoundingClientRect();
      var sx = ev.clientX - caja.left, sy = ev.clientY - caja.top;
      var mejor = null, mejorD = 28 * 28;
      posCrestas.forEach(function (p) {
        var d = (p.x - sx) * (p.x - sx) + (p.y - sy) * (p.y - sy);
        if (d < mejorD) { mejorD = d; mejor = p.a; }
      });
      seleccionar(mejor ? mejor.clave : null);
    });

    btnBase.addEventListener('click', function () {
      btnBase.disabled = true;
      elMsj.className = 'ag-msj'; elMsj.textContent = 'Fijando la referencia…';
      fetch('/api/v1/autogenes/qualia/base', { method: 'POST' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btnBase.disabled = false;
          elMsj.className = 'ag-msj ' + (res.ok ? 'ok' : 'error');
          elMsj.textContent = res.ok
            ? 'Referencia fijada — el terreno vuelve a plano y medirá desde aquí'
            : (res.j.error || 'No se pudo fijar la base');
          if (res.ok) { seleccionada = null; pintarDetalle(null); cargar(); }
        })
        .catch(function () {
          btnBase.disabled = false;
          elMsj.className = 'ag-msj error';
          elMsj.textContent = 'Sin conexión — reintenta';
        });
    });

    leerColores();
    tamano();
    window.addEventListener('resize', dibujar);
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); dibujar(); }, 60);
    });
    cargar();
  });
})();
