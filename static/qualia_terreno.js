/* GNOSIS · Qualia — Terreno de anomalías (Q3: instrumento topográfico).
   El Marco como un levantamiento topográfico. En reposo NO es papel
   plano: es una MEMBRANA VIVA — un manifold de curvatura sutil tejido por
   un campo tensor de fibras (Riemann/biomecánico), el sustrato del
   instrumento que vigila en calma. Donde un detector disparó, una CRESTA
   se alza en magenta (--danger: alerta REAL) rodeada de curvas de nivel:
   la altura ES la severidad y los contornos la miden. Nueve estaciones
   de detector, nombre de negocio, tap para el porqué. El relieve de fondo
   es una huella determinista de la sesión, no dato de anomalía; las cifras
   citables son las severidades. Estático (la deformación es la
   información; reduced-motion no lo afecta). Determinista.
   Datos: /api/v1/autogenes/qualia/estado — jamás inventados. */
(function () {
  'use strict';

  var Q = window.QualiaComun;
  var DETECTORES = [
    { id: 'hub-nuevo', etiqueta: 'HUBS', nombre: 'Concentrador nuevo',
      definicion: 'Concentrador nuevo: una entidad acumula muchas más conexiones que antes.' },
    { id: 'exponente', etiqueta: 'LEY', nombre: 'Cambió quién concentra',
      definicion: 'La distribución de conectividad cambió de régimen en todo el grafo.' },
    { id: 'puente-nuevo', etiqueta: 'PUENTES+', nombre: 'Puente nuevo',
      definicion: 'Apareció un puente crítico: el único camino entre dos regiones de tu red.' },
    { id: 'puente-caido', etiqueta: 'PUENTES−', nombre: 'Puente que cayó',
      definicion: 'Algo que era puente crítico dejó de serlo.' },
    { id: 'islas', etiqueta: 'ISLAS', nombre: 'Islas',
      definicion: 'Cambió el número de fragmentos desconectados: tu grafo se partió o se fusionó.' },
    { id: 'densidad', etiqueta: 'TEJIDO', nombre: 'El tejido se apretó',
      definicion: 'La densidad de enlaces se apretó o se aflojó contra tu referencia.' },
    { id: 'rafaga', etiqueta: 'RÁFAGA', nombre: 'Pico de actividad',
      definicion: 'Actividad en ráfagas: mucho en poco tiempo frente a tu cadencia usual.' },
    { id: 'ritmo', etiqueta: 'RITMO', nombre: 'Cambió el ritmo',
      definicion: 'Tu cadencia se quebró: la actividad dejó de parecerse a sí misma.' },
    { id: 'fuente', etiqueta: 'FUENTES', nombre: 'Desvío en fuentes',
      definicion: 'Una serie externa guardada se desvió de su comportamiento (latente hasta que existan series).' }
  ];
  var EPICENTROS = DETECTORES.map(function (d, i) {
    return { id: d.id, etiqueta: d.etiqueta, nombre: d.nombre,
             x: ((i % 3) - 1) * 0.62, z: (Math.floor(i / 3) - 1) * 0.62 };
  });
  var SIGMA2 = 2 * 0.16 * 0.16;

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qt-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.setAttribute('role', 'img');

    var elInfo = document.getElementById('qt-info');
    var elDetalle = document.getElementById('qt-detalle');
    var elDefs = document.getElementById('qt-detectores');
    var elSello = document.getElementById('qt-sello');
    var btnBase = document.getElementById('qt-base');
    var elMsj = document.getElementById('qt-msj');

    var C = {};
    var estado = null;
    var crestas = [];
    var posCrestas = [];
    var seleccionada = null;
    var swells = [];            // membrana viva: huella determinista

    function nombreDe(detector) {
      var d = DETECTORES.find(function (x) { return x.id === detector; });
      return d ? d.nombre : detector;
    }

    // ── membrana viva: swells sembrados por propiedades estables de la
    // sesión (determinista, misma sesión = misma huella). NO es dato. ────
    function sembrarMembrana() {
      var r = estado.resumen || {};
      var semilla = ((r.n_nodos || 7) * 131 + (r.n_comunidades || 2) * 17 +
                     (r.n_enlaces || 5) * 7 + 101) & 0x7fffffff;
      function rnd() { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; }
      swells = [];
      var nS = 4 + (r.n_comunidades ? Math.min(2, r.n_comunidades % 3) : 0);
      for (var i = 0; i < nS; i++) {
        swells.push({
          x: (rnd() * 2 - 1) * 0.85, z: (rnd() * 2 - 1) * 0.85,
          amp: (rnd() * 0.11 + 0.05) * (rnd() < 0.4 ? -1 : 1),
          s2: rnd() * 0.16 + 0.10
        });
      }
    }
    function base(x, z) {
      var s = 0;
      for (var i = 0; i < swells.length; i++) {
        var sw = swells[i], dx = x - sw.x, dz = z - sw.z;
        s += sw.amp * Math.exp(-(dx * dx + dz * dz) / (2 * sw.s2));
      }
      return s;
    }
    function gradBase(x, z) {
      var e = 0.04;
      return [(base(x + e, z) - base(x - e, z)) / (2 * e),
              (base(x, z + e) - base(x, z - e)) / (2 * e)];
    }
    function anom(x, z) {
      var s = 0;
      for (var i = 0; i < crestas.length; i++) {
        var c = crestas[i], d2 = (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z);
        s += c.altura * Math.exp(-d2 / SIGMA2);
      }
      return s;
    }
    function altura(x, z) { return base(x, z) + Math.min(1.2, anom(x, z)); }

    function construirCrestas() {
      var porDetector = {};
      (estado.hallazgos || []).forEach(function (a) {
        (porDetector[a.detector] = porDetector[a.detector] || []).push(a);
      });
      crestas = [];
      EPICENTROS.forEach(function (e) {
        (porDetector[e.id] || []).forEach(function (a, k) {
          var abanico = (k - ((porDetector[e.id].length) - 1) / 2) * 0.18;
          crestas.push({ x: e.x + abanico, z: e.z + (k % 2 === 0 ? 0 : 0.12),
                         altura: 0.15 + 0.85 * a.severidad, a: a });
        });
      });
    }

    function dibujar() {
      if (!estado) return;
      var d = Q.medir(canvas, ctx, 420);
      var w = d.w, h = d.h, cx = w / 2, cy = h * 0.54;
      var A = Math.min(w, h) * 0.34, B = A * 0.5, H = Math.min(w, h) * 0.34;
      function proy(x, z, y) { return [cx + (x - z) * A, cy + (x + z) * B - y * H]; }
      ctx.clearRect(0, 0, w, h);

      var COLS = 34, FIL = 34;
      var V = [];
      for (var i = 0; i < COLS; i++) {
        V[i] = [];
        for (var j = 0; j < FIL; j++) {
          var x = (i / (COLS - 1)) * 2 - 1, z = (j / (FIL - 1)) * 2 - 1;
          var p = proy(x, z, altura(x, z));
          V[i][j] = { sx: p[0], sy: p[1], x: x, z: z };
        }
      }
      // malla: membrana cian tenue; un toque de magenta donde la anomalía
      // levanta el terreno (la silueta de la cresta).
      function seg(a, b) {
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = Q.alfa(C.linea, 0.16); ctx.lineWidth = 1; ctx.stroke();
        var na = anom((a.x + b.x) / 2, (a.z + b.z) / 2);
        if (na > 0.05) {
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
          ctx.strokeStyle = Q.alfa(C.danger, Math.min(0.7, na)); ctx.lineWidth = 1.1; ctx.stroke();
        }
      }
      for (var j2 = 0; j2 < FIL; j2++) for (var i2 = 0; i2 < COLS - 1; i2++) seg(V[i2][j2], V[i2 + 1][j2]);
      for (var i3 = 0; i3 < COLS; i3++) for (var j3 = 0; j3 < FIL - 1; j3++) seg(V[i3][j3], V[i3][j3 + 1]);

      // campo tensor de fibras (Riemann/biomecánico): fibra a lo largo del
      // contorno del sustrato; se apaga bajo las crestas.
      ctx.shadowColor = C.acc;
      for (var fx = -0.85; fx <= 0.85; fx += 0.16) {
        for (var fz = -0.85; fz <= 0.85; fz += 0.16) {
          var g = gradBase(fx, fz), gm = Math.hypot(g[0], g[1]);
          var dir = gm < 1e-4 ? [1, 0] : [-g[1] / gm, g[0] / gm];
          var len = 0.035 + 0.09 * Math.min(1, gm), at = Math.max(0, 1 - anom(fx, fz) * 3);
          if (at <= 0.03) continue;
          var pa = proy(fx - dir[0] * len, fz - dir[1] * len, base(fx - dir[0] * len, fz - dir[1] * len));
          var pb = proy(fx + dir[0] * len, fz + dir[1] * len, base(fx + dir[0] * len, fz + dir[1] * len));
          ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
          ctx.strokeStyle = Q.alfa(C.acc, (0.18 + 0.4 * Math.min(1, gm)) * at);
          ctx.shadowBlur = 4; ctx.lineWidth = 1.2; ctx.stroke();
          var pc = proy(fx, fz, base(fx, fz));
          ctx.beginPath(); ctx.arc(pc[0], pc[1], 1, 0, 6.283);
          ctx.fillStyle = Q.alfa(C.acc, 0.32 * at); ctx.fill();
        }
      }
      ctx.shadowBlur = 0;

      // estaciones en reposo: detector vigilando, sin desviación
      var activos = {};
      crestas.forEach(function (c) { activos[c.a.detector] = true; });
      ctx.textAlign = 'center';
      EPICENTROS.forEach(function (e) {
        if (activos[e.id]) return;
        var p = proy(e.x, e.z, altura(e.x, e.z));
        ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, 0.5);
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.283); ctx.strokeStyle = Q.alfa(C.acc, 0.4); ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        ctx.beginPath(); ctx.arc(p[0], p[1], 1.5, 0, 6.283); ctx.fillStyle = Q.alfa(C.acc, 0.55); ctx.fill();
        ctx.font = '9px "JetBrains Mono", monospace'; ctx.textBaseline = 'top';
        ctx.fillStyle = Q.alfa(C.t3, 0.6); ctx.fillText(e.nombre, p[0], p[1] + 6);
      });

      // crestas: curvas de nivel magenta + ápice + etiqueta
      posCrestas = [];
      crestas.forEach(function (c) {
        [0.85, 0.6, 0.38, 0.18].forEach(function (f) {
          var r = Math.sqrt(SIGMA2 * Math.log(1 / f)), lvl = c.altura * f;
          ctx.beginPath();
          for (var t = 0; t <= 40; t++) {
            var a = t / 40 * 6.283, p = proy(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, base(c.x, c.z) + lvl);
            if (t === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
          }
          ctx.closePath();
          ctx.strokeStyle = Q.alfa(C.danger, 0.25 + 0.5 * f);
          ctx.shadowColor = C.danger; ctx.shadowBlur = 8; ctx.lineWidth = 1.2; ctx.stroke(); ctx.shadowBlur = 0;
        });
        var pk = proy(c.x, c.z, altura(c.x, c.z));
        posCrestas.push({ x: pk[0], y: pk[1], a: c.a });
        var esSel = seleccionada === c.a.clave;
        ctx.beginPath(); ctx.moveTo(pk[0], pk[1] - 6); ctx.lineTo(pk[0] - 5, pk[1] + 2); ctx.lineTo(pk[0] + 5, pk[1] + 2); ctx.closePath();
        ctx.fillStyle = C.danger; ctx.shadowColor = C.danger; ctx.shadowBlur = esSel ? 14 : 9; ctx.fill(); ctx.shadowBlur = 0;
        var txt = nombreDe(c.a.detector) + '  ' + Math.round(c.a.severidad * 100) + '%';
        ctx.font = '700 11px "JetBrains Mono", monospace'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
        var medio = ctx.measureText(txt).width / 2;
        var tx = Math.max(12 + medio, Math.min(w - 12 - medio, pk[0]));
        ctx.lineWidth = 3; ctx.strokeStyle = C.fondo; ctx.strokeText(txt, tx, pk[1] - 9);
        ctx.fillStyle = C.danger; ctx.fillText(txt, tx, pk[1] - 9);
      });

      Q.brackets(ctx, w, h, C.acc);

      elInfo.textContent = crestas.length === 0
        ? (estado.base ? 'TERRENO PLANO · SIN DESVIACIONES CONTRA TU REFERENCIA'
                       : 'TERRENO PLANO · ' + (estado.motivo || 'SIN REFERENCIA').toUpperCase())
        : crestas.length + ' CRESTA' + (crestas.length === 1 ? '' : 'S') +
          ' · LA MÁS SEVERA «' + nombreDe(crestas[0].a.detector).toUpperCase() + '» ' +
          Math.round(crestas[0].a.severidad * 100) + '%';
    }

    // ── panel ────────────────────────────────────────────────────────
    function pintarDetalle(a) {
      if (!a) {
        elDetalle.innerHTML = '<p class="qa-base-hint">Toca una cresta para ver ' +
          'qué midió el detector y contra qué referencia.</p>';
        return;
      }
      var det = DETECTORES.find(function (x) { return x.id === a.detector; });
      elDetalle.innerHTML =
        '<div class="gr-kind">' + Q.esc(nombreDe(a.detector)) + ' · SEVERIDAD ' +
        Math.round(a.severidad * 100) + '%</div>' +
        '<div class="gr-nombre">' + Q.esc(a.titulo) + '</div>' +
        '<p class="qa-lectura">' + Q.esc(a.detalle) + '</p>' +
        (det ? '<p class="qa-base-hint">' + Q.esc(det.definicion) + '</p>' : '');
    }
    function pintarLista() {
      var sev = {};
      (estado.hallazgos || []).forEach(function (a) { sev[a.detector] = a; });
      var html = '';
      DETECTORES.slice().sort(function (p, q) {
        return (sev[q.id] ? sev[q.id].severidad : 0) - (sev[p.id] ? sev[p.id].severidad : 0);
      }).forEach(function (dt) {
        var a = sev[dt.id];
        html += '<button type="button" class="qa-caja qa-item' + (a ? ' anomalia' : '') +
          (a && seleccionada === a.clave ? ' activo' : '') + '"' +
          (a ? ' data-clave="' + Q.esc(a.clave) + '"' : ' disabled') +
          ' title="' + Q.esc(dt.definicion) + '"><span>' + Q.esc(dt.nombre) + '</span><b>' +
          (a ? Math.round(a.severidad * 100) + '%' : '—') + '</b></button>';
      });
      elDefs.innerHTML = html;
      elDefs.querySelectorAll('.qa-item[data-clave]').forEach(function (b) {
        b.addEventListener('click', function () { seleccionar(b.getAttribute('data-clave')); });
      });
      var n = (estado.hallazgos || []).length;
      elSello.textContent = n ? n + (n === 1 ? ' desviación medida' : ' desviaciones medidas')
        : (estado.base ? 'Terreno plano · sin desviaciones' : (estado.motivo || 'Sin referencia fijada'));
      elSello.className = 'qt-sello' + (n ? ' alerta' : '');
    }
    function seleccionar(clave) {
      seleccionada = seleccionada === clave ? null : clave;
      var a = (estado.hallazgos || []).find(function (x) { return x.clave === seleccionada; });
      pintarDetalle(a || null); pintarLista(); dibujar();
    }

    var reqSeq = 0;
    function cargar() {
      var mia = ++reqSeq;
      fetch('/api/v1/autogenes/qualia/estado').then(function (r) { return r.json(); }).then(function (j) {
        if (mia !== reqSeq) return;
        if (!j || j.error) { elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase(); return; }
        estado = j;
        sembrarMembrana();
        construirCrestas();
        btnBase.textContent = estado.base ? 'refijar base' : 'fijar base';
        canvas.setAttribute('aria-label',
          'Terreno de anomalías: ' + (estado.hallazgos || []).length +
          ' desviaciones medidas contra tu referencia. Los detectores se listan a la derecha con su severidad.');
        pintarLista(); dibujar();
      }).catch(function () { elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }

    canvas.addEventListener('pointerup', function (ev) {
      var caja = canvas.getBoundingClientRect();
      var sx = ev.clientX - caja.left, sy = ev.clientY - caja.top;
      var mejor = null, mejorD = 28 * 28;
      posCrestas.forEach(function (p) {
        var dd = (p.x - sx) * (p.x - sx) + (p.y - sy) * (p.y - sy);
        if (dd < mejorD) { mejorD = dd; mejor = p.a; }
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
          elMsj.className = 'ag-msj error'; elMsj.textContent = 'Sin conexión — reintenta';
        });
    });

    C = Q.leerColores();
    window.addEventListener('resize', dibujar);
    Q.alTema(function () { C = Q.leerColores(); dibujar(); });
    cargar();
  });
})();
