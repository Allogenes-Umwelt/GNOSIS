/* GNOSIS · Qualia — Horizonte de eventos (Q3: osciloscopio rico).
   La telemetría PROPIA del operador como una línea de tiempo cósmica: las
   dos series (conceptos = nodos, vínculos = enlaces) en un ÚNICO eje de
   conteo absoluto y rotulado — comparables y legibles en valor real (fin
   de la doble normalización ciega). Emergen de una banda de HORIZONTE
   luminosa (el nombre lo pide) sobre una atmósfera de polvo; cada muestra
   es un nodo-evento con halo — punto porque ESO es: nada entre muestras
   se inventa. Las intervenciones del operador (bitácora WORM) son
   columnas de luz coronadas por la roseta de tres puntas P3₂ (el motivo
   de la constelación); tocar una revela su delta MEDIDO entre las
   muestras que la flanquean (null honesto si no hay muestra posterior).
   Estático: nada que congelar. Datos: /api/v1/autogenes/qualia/horizonte. */
(function () {
  'use strict';

  var Q = window.QualiaComun;
  var M = { l: 52, r: 22, t: 26, b: 34 };

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qh-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.setAttribute('role', 'img');

    var elInfo = document.getElementById('qh-info');
    var elDetalle = document.getElementById('qh-detalle');
    var elSpec = document.getElementById('qh-spec');
    var elLineas = document.getElementById('qh-lineas');

    var C = {};
    var horizonte = null;
    var seleccionada = null;
    var posLineas = [];

    function epoca(ts) { return Date.parse(String(ts).replace(' ', 'T') + 'Z'); }
    function fechaCorta(ts) { return String(ts).slice(0, 16); }
    function fechaDia(ts) { return String(ts).slice(5, 10); }
    function pasoLindo(max) {
      if (max <= 0) return 1;
      var raw = max / 5, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
      return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
    }

    function dibujar() {
      if (!horizonte) return;
      var d = Q.medir(canvas, ctx, 420);
      var w = d.w, h = d.h;
      var puntos = horizonte.puntos, lineas = horizonte.lineas;
      var x0 = M.l, x1 = w - M.r, y0 = M.t, y1 = h - M.b;
      var t0 = epoca(horizonte.t0), t1 = epoca(horizonte.t1), ancho = Math.max(t1 - t0, 1);
      var maxV = Math.max(horizonte.max_nodos || 1, horizonte.max_enlaces || 1);
      var paso = pasoLindo(maxV), maxTick = Math.max(paso, Math.ceil(maxV / paso) * paso);
      function X(ts) { return x0 + ((epoca(ts) - t0) / ancho) * (x1 - x0); }
      function Y(v) { return y1 - (v / maxTick) * (y1 - y0); }
      ctx.clearRect(0, 0, w, h);

      // atmósfera: viñeta + polvo determinista
      var vg = ctx.createRadialGradient((x0 + x1) / 2, y1, 10, (x0 + x1) / 2, y1, (x1 - x0) * 0.8);
      vg.addColorStop(0, Q.alfa(C.acc, 0.05)); vg.addColorStop(1, Q.alfa(C.acc, 0));
      ctx.fillStyle = vg; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      var sd = 20260704; function rnd() { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; }
      for (var pp = 0; pp < 70; pp++) {
        var dx = x0 + rnd() * (x1 - x0), dy = y0 + rnd() * (y1 - y0), br = rnd();
        ctx.beginPath(); ctx.arc(dx, dy, br < 0.85 ? 0.6 : 1.1, 0, 6.283);
        ctx.fillStyle = Q.alfa(C.t3, 0.04 + 0.08 * br); ctx.fill();
      }

      // banda de horizonte: la base luminosa de donde emergen los eventos
      var hz = ctx.createLinearGradient(0, y1 - 38, 0, y1);
      hz.addColorStop(0, Q.alfa(C.acc, 0)); hz.addColorStop(1, Q.alfa(C.acc, 0.10));
      ctx.fillStyle = hz; ctx.fillRect(x0, y1 - 38, x1 - x0, 38);
      ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1);
      ctx.strokeStyle = Q.alfa(C.acc, 0.5); ctx.shadowColor = C.acc; ctx.shadowBlur = 8; ctx.lineWidth = 1.4; ctx.stroke(); ctx.shadowBlur = 0;

      // retícula + eje Y absoluto rotulado; mayores rotulados, menores finos
      ctx.font = '9px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
      for (var tk = 0; tk <= maxTick + 0.001; tk += paso / 2) {
        var gy = Y(tk), mayor = (Math.round(tk / paso) * paso === tk);
        ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy);
        ctx.strokeStyle = Q.alfa(C.linea, mayor ? 0.16 : 0.07); ctx.lineWidth = 1; ctx.stroke();
        if (mayor) {
          ctx.textAlign = 'right'; ctx.fillStyle = Q.alfa(C.t3, 0.85);
          ctx.fillText(String(Math.round(tk)), x0 - 8, gy);
        }
      }
      ctx.save(); ctx.translate(14, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
      ctx.fillStyle = Q.alfa(C.t3, 0.9); ctx.fillText('conteo (conceptos · vínculos)', 0, 0); ctx.restore();

      // columnas de intervención: haz vertical + roseta P3₂
      posLineas = [];
      lineas.forEach(function (linea, i) {
        var px = X(linea.ts), esSel = seleccionada === i;
        posLineas.push({ x: px, i: i });
        var cg = ctx.createLinearGradient(px - 9, 0, px + 9, 0);
        cg.addColorStop(0, Q.alfa(C.acc, 0)); cg.addColorStop(0.5, Q.alfa(C.acc, esSel ? 0.2 : 0.12)); cg.addColorStop(1, Q.alfa(C.acc, 0));
        ctx.fillStyle = cg; ctx.fillRect(px - 9, y0 - 4, 18, (y1 - y0) + 4);
        ctx.beginPath(); ctx.moveTo(px, y0 - 4); ctx.lineTo(px, y1);
        ctx.strokeStyle = Q.alfa(C.acc, esSel ? 0.9 : 0.55); ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        ctx.save(); ctx.translate(px, y0 + 2); ctx.fillStyle = C.acc; ctx.shadowColor = C.acc; ctx.shadowBlur = esSel ? 12 : 10;
        for (var r = 0; r < 3; r++) {
          var a = r * 2.094 - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
          ctx.lineTo(Math.cos(a + 0.42) * 3.5, Math.sin(a + 0.42) * 3.5);
          ctx.lineTo(Math.cos(a - 0.42) * 3.5, Math.sin(a - 0.42) * 3.5); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(0, 0, 2, 0, 6.283); ctx.fillStyle = C.fondo; ctx.fill();
        ctx.restore(); ctx.shadowBlur = 0;
      });

      // trazas: cintas luminosas + lavado; misma escala absoluta
      function traza(campo, color, areaA, glow) {
        if (!puntos.length) return;
        ctx.beginPath(); ctx.moveTo(X(puntos[0].ts), Y(campo(puntos[0])));
        puntos.forEach(function (p) { ctx.lineTo(X(p.ts), Y(campo(p))); });
        ctx.lineTo(X(puntos[puntos.length - 1].ts), y1); ctx.lineTo(X(puntos[0].ts), y1); ctx.closePath();
        var g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, Q.alfa(color, areaA)); g.addColorStop(0.7, Q.alfa(color, areaA * 0.35)); g.addColorStop(1, Q.alfa(color, 0));
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath();
        puntos.forEach(function (p, i) { var px = X(p.ts), py = Y(campo(p)); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
        ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.lineWidth = 2.2; ctx.stroke(); ctx.shadowBlur = 0;
        puntos.forEach(function (p) {
          var px = X(p.ts), py = Y(campo(p));
          var hg = ctx.createRadialGradient(px, py, 0, px, py, 7);
          hg.addColorStop(0, Q.alfa(color, 0.6)); hg.addColorStop(1, Q.alfa(color, 0));
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(px, py, 7, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 6.283); ctx.fillStyle = color; ctx.fill();
        });
      }
      traza(function (p) { return p.n_enlaces; }, C.t1, 0.12, 7);
      traza(function (p) { return p.n_nodos; }, C.acc, 0.20, 11);

      // etiquetas de intervención
      lineas.forEach(function (linea) {
        var px = X(linea.ts);
        ctx.font = '700 10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3; ctx.strokeStyle = C.fondo; ctx.strokeText(linea.accion, px, y0 - 16);
        ctx.fillStyle = C.acc; ctx.fillText(linea.accion, px, y0 - 16);
      });

      // eje de tiempo: cada muestra tickeada + cotas de fecha
      ctx.font = '9px "JetBrains Mono", monospace'; ctx.textBaseline = 'top';
      puntos.forEach(function (p, i) {
        var px = X(p.ts);
        ctx.beginPath(); ctx.moveTo(px, y1); ctx.lineTo(px, y1 + (i % 2 === 0 ? 5 : 3));
        ctx.strokeStyle = Q.alfa(C.t3, 0.5); ctx.lineWidth = 1; ctx.stroke();
      });
      ctx.fillStyle = Q.alfa(C.t3, 0.85);
      ctx.textAlign = 'left'; ctx.fillText(fechaDia(horizonte.t0), x0, y1 + 8);
      ctx.textAlign = 'right'; ctx.fillText(fechaDia(horizonte.t1), x1, y1 + 8);

      Q.brackets(ctx, w, h, C.acc);
    }

    // ── ficha ────────────────────────────────────────────────────────
    function signo(n) { return n > 0 ? '+' + n : String(n); }
    function pintarDetalle(linea) {
      if (!linea) {
        elDetalle.innerHTML = '<p class="qa-base-hint">Toca una intervención (columna ' +
          'vertical) para ver su delta medido entre las muestras que la flanquean.</p>';
        return;
      }
      var delta = linea.delta === null
        ? '<p class="qa-base-hint">Sin muestra posterior todavía — el delta se ' +
          'medirá cuando exista, no se interpola.</p>'
        : '<p class="qa-lectura">Delta medido: <b>' + signo(linea.delta.nodos) +
          ' conceptos</b>, <b>' + signo(linea.delta.enlaces) + ' vínculos</b> ' +
          'entre las muestras que flanquean la intervención.</p>';
      elDetalle.innerHTML =
        '<div class="gr-kind">' + Q.esc(linea.accion.toUpperCase()) + ' · ' +
        Q.esc(fechaCorta(linea.ts)) + '</div>' +
        '<div class="gr-nombre">' + Q.esc(linea.detalle) + '</div>' + delta;
    }
    function pintarFicha() {
      elSpec.innerHTML =
        '<div class="qa-bar"><span class="l">muestras</span><span class="v">' + horizonte.puntos.length + '</span></div>' +
        '<div class="qa-bar"><span class="l">intervenciones</span><span class="v">' + horizonte.lineas.length + '</span></div>' +
        '<div class="qa-bar"><span class="l">conceptos hoy</span><span class="v">' +
        (horizonte.puntos.length ? horizonte.puntos[horizonte.puntos.length - 1].n_nodos : 0) + '</span></div>' +
        '<div class="qa-bar"><span class="l">vínculos hoy</span><span class="v">' +
        (horizonte.puntos.length ? horizonte.puntos[horizonte.puntos.length - 1].n_enlaces : 0) + '</span></div>';
      var html = '';
      horizonte.lineas.forEach(function (l, i) {
        html += '<button type="button" class="qa-caja qa-item' + (seleccionada === i ? ' activo' : '') +
          '" data-i="' + i + '"><span title="' + Q.esc(l.detalle) + '">' + Q.esc(l.accion) + ' · ' +
          Q.esc(l.detalle.slice(0, 22)) + '</span><b>' +
          (l.delta ? signo(l.delta.nodos) + '/' + signo(l.delta.enlaces) : '—') + '</b></button>';
      });
      elLineas.innerHTML = html ||
        '<p class="qa-base-hint">Sin intervenciones dentro de la ventana muestreada.</p>';
      elLineas.querySelectorAll('.qa-item').forEach(function (b) {
        b.addEventListener('click', function () { seleccionar(parseInt(b.getAttribute('data-i'), 10)); });
      });
    }
    function seleccionar(i) {
      seleccionada = seleccionada === i ? null : i;
      pintarDetalle(seleccionada === null ? null : horizonte.lineas[seleccionada]);
      pintarFicha(); dibujar();
    }

    function cargar() {
      fetch('/api/v1/autogenes/qualia/horizonte').then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.error) { elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase(); return; }
        horizonte = j.horizonte;
        if (!horizonte) {
          var motivo = j.motivo || 'La telemetría nace con la primera mutación del grafo.';
          elInfo.textContent = motivo.toUpperCase();
          elSpec.innerHTML = '';
          elLineas.innerHTML = '<p class="qa-base-hint">' + Q.esc(motivo) + '</p>';
          canvas.setAttribute('aria-label', 'Horizonte de eventos: ' + motivo);
          return;
        }
        elInfo.textContent = horizonte.puntos.length + ' MUESTRAS · ' + horizonte.lineas.length +
          ' INTERVENCIONES · NADA ENTRE MUESTRAS SE INVENTA';
        canvas.setAttribute('aria-label',
          'Horizonte de eventos: ' + horizonte.puntos.length + ' muestras de telemetría con ' +
          horizonte.lineas.length + ' intervenciones del operador, en un eje de conteo absoluto. ' +
          'El detalle de cada intervención está a la derecha.');
        pintarFicha(); dibujar();
      }).catch(function () { elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }

    canvas.addEventListener('pointerup', function (ev) {
      if (!horizonte) return;
      var caja = canvas.getBoundingClientRect();
      var sx = ev.clientX - caja.left, mejor = null, mejorD = 18;
      posLineas.forEach(function (p) { var dd = Math.abs(p.x - sx); if (dd < mejorD) { mejorD = dd; mejor = p.i; } });
      seleccionar(mejor);
    });

    if (window.QualiaExport) window.QualiaExport.montar({
      canvas: canvas, archivo: 'qualia-horizonte',
      metodo: 'telemetría muestreada · delta medido entre muestras que flanquean',
      datos: function () {
        if (!horizonte) return { headers: [], filas: [] };
        var filas = (horizonte.puntos || []).map(function (p) {
          return ['muestra', p.ts, p.n_nodos, p.n_enlaces];
        });
        (horizonte.lineas || []).forEach(function (l) {
          filas.push(['intervención', l.ts, l.accion || '', l.detalle || '']);
        });
        return { headers: ['tipo', 'ts', 'conceptos/acción', 'vínculos/detalle'], filas: filas };
      }
    });
    C = Q.leerColores();
    window.addEventListener('resize', dibujar);
    Q.alTema(function () { C = Q.leerColores(); dibujar(); });
    cargar();
  });
})();
