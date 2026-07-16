/* GNOSIS · Qualia — Cuerdas del caso (Q3: cintas de aurora).
   Los conceptos sobre un anillo en ORDEN DE COMUNIDAD (el mismo del
   motor: comunidades contiguas). Cada comunidad es un arco luminoso cuyo
   grosor dice cuántos concentra; cada vínculo es una CINTA arqueada que
   deja el ojo abierto, con ancho y brillo por peso y bloom en las
   fuertes — flujo, no maraña. Cada nodo emite una pluma radial por su
   peso (crown emplumado). Tocar el anillo aísla las cuerdas de un
   concepto; el resto se atenúa. Navegable (arrastre + rueda). Estático:
   nada que congelar. Trazos con la variante AAA por modo; cian = vivo,
   magenta reservado al Terreno. Datos: /api/v1/autogenes/qualia/red. */
(function () {
  'use strict';

  var Q = window.QualiaComun;
  var R = 400;   // radio del anillo en unidades de mundo

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qd-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.setAttribute('role', 'img');

    var elInfo = document.getElementById('qd-info');
    var elDetalle = document.getElementById('qd-detalle');
    var elComs = document.getElementById('qd-comunidades');

    var C = {};
    var datos = null;
    var seleccionado = null;
    var hover = null;
    var vista = { x: 0, y: 0, k: 1 };
    var centro = { x: 0, y: 0 };
    var etiquetaDe = {};

    function tang(a) { return [-Math.sin(a), Math.cos(a)]; }

    function sectores() {                       // corridas de comunidad
      var s = [], prev = null;
      datos.orden.forEach(function (id, i) {
        var c = datos.comunidad[id];
        if (c !== prev) { s.push({ c: c, i0: i, i1: i, hub: id, n: 1 }); prev = c; }
        else { var u = s[s.length - 1]; u.i1 = i; u.n++; }
      });
      return s;
    }

    function dibujar() {
      if (!datos) return;
      var d = Q.medir(canvas, ctx, 420);
      var w = d.w, h = d.h;
      var orden = datos.orden, n = orden.length;
      ctx.clearRect(0, 0, w, h);
      if (n === 0) return;
      var m = 96;
      var k = 0.92 * Math.min((w - 2 * m) / (2 * R), (h - 2 * m) / (2 * R)) * vista.k;
      function P(x, y) { return [w / 2 + x * k + vista.x, h / 2 + y * k + vista.y]; }
      var c0 = P(0, 0); centro = { x: c0[0], y: c0[1] };
      var cx = centro.x, cy = centro.y;

      var scr = {}, ang = {};
      orden.forEach(function (id, i) {
        var a = (i / n) * 6.283 - Math.PI / 2;
        ang[id] = a; scr[id] = P(Math.cos(a) * R, Math.sin(a) * R);
      });

      // vecinos del seleccionado (para atenuar el resto)
      var vecinos = {};
      if (seleccionado) {
        datos.red.enlaces.forEach(function (e) {
          if (e.origen === seleccionado) vecinos[e.destino] = true;
          if (e.destino === seleccionado) vecinos[e.origen] = true;
        });
      }

      // arcos de comunidad: bandas luminosas, grosor por tamaño
      var secs = sectores();
      var maxN = Math.max.apply(null, secs.map(function (s) { return s.n; }));
      var Rp = R * 1.05;
      secs.forEach(function (s) {
        var a0 = (s.i0 / n) * 6.283 - Math.PI / 2 - Math.PI / n * 0.6;
        var a1 = (s.i1 / n) * 6.283 - Math.PI / 2 + Math.PI / n * 0.6;
        var selEnSec = seleccionado && datos.comunidad[seleccionado] === s.c;
        var inten = (seleccionado && !selEnSec ? 0.14 : 0.42) + 0.5 * (s.n / maxN) * (selEnSec ? 1 : 0.8);
        ctx.beginPath();
        for (var t = 0; t <= 24; t++) {
          var aa = a0 + (a1 - a0) * t / 24;
          var pp = P(Math.cos(aa) * Rp, Math.sin(aa) * Rp);
          if (t === 0) ctx.moveTo(pp[0], pp[1]); else ctx.lineTo(pp[0], pp[1]);
        }
        ctx.strokeStyle = Q.alfa(C.acc, inten);
        ctx.shadowColor = C.acc; ctx.shadowBlur = 12;
        ctx.lineWidth = (5 + 6 * (s.n / maxN)); ctx.lineCap = 'butt'; ctx.stroke();
        ctx.shadowBlur = 0;
        // etiqueta de comunidad (el hub del sector): solo comunidades con
        // cuerpo (≥3) o la seleccionada — las diminutas viven en el panel,
        // así el anillo no se satura de rótulos encimados.
        if (s.n >= 3 || selEnSec) {
          var am = (a0 + a1) / 2, ep = P(Math.cos(am) * R * 1.16, Math.sin(am) * R * 1.16);
          ctx.font = '700 11px "JetBrains Mono", monospace';
          ctx.textBaseline = 'middle'; ctx.textAlign = Math.cos(am) >= 0 ? 'left' : 'right';
          var et = (etiquetaDe[s.hub] || '').slice(0, 22);
          ctx.lineWidth = 3; ctx.strokeStyle = C.fondo; ctx.strokeText(et, ep[0], ep[1]);
          ctx.fillStyle = Q.alfa(C.acc, seleccionado && !selEnSec ? 0.4 : 0.95);
          ctx.fillText(et, ep[0], ep[1]);
        }
      });

      // cintas de aurora: débiles→fuertes; con selección, el resto fantasma
      datos.red.enlaces.slice().sort(function (a, b) {
        return (a.peso || 0.5) - (b.peso || 0.5);
      }).forEach(function (e) {
        var A = scr[e.origen], B = scr[e.destino]; if (!A || !B) return;
        var toca = seleccionado !== null && (e.origen === seleccionado || e.destino === seleccionado);
        var atenuar = seleccionado !== null && !toca;
        var pw = Math.max(0, Math.min(1, e.peso || 0.5));
        var hwA = 1 + pw * 5, hwB = 1 + pw * 5;
        var tA = tang(ang[e.origen]), tB = tang(ang[e.destino]);
        var A1 = [A[0] + tA[0] * hwA, A[1] + tA[1] * hwA], A2 = [A[0] - tA[0] * hwA, A[1] - tA[1] * hwA];
        var B1 = [B[0] + tB[0] * hwB, B[1] + tB[1] * hwB], B2 = [B[0] - tB[0] * hwB, B[1] - tB[1] * hwB];
        var mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        var kx = mx + (cx - mx) * 0.78, ky = my + (cy - my) * 0.78;
        ctx.beginPath();
        ctx.moveTo(A1[0], A1[1]); ctx.quadraticCurveTo(kx, ky, B1[0], B1[1]);
        ctx.lineTo(B2[0], B2[1]); ctx.quadraticCurveTo(kx, ky, A2[0], A2[1]); ctx.closePath();
        if (atenuar) {
          ctx.fillStyle = Q.alfa(C.linea, 0.05);
        } else {
          var g = ctx.createLinearGradient(A[0], A[1], B[0], B[1]);
          var base = toca ? 0.22 : 0.05, top = toca ? 0.5 : 0.30;
          g.addColorStop(0, Q.alfa(C.acc, base + 0.14 * pw));
          g.addColorStop(0.5, Q.alfa(C.acc, top * (0.5 + pw)));
          g.addColorStop(1, Q.alfa(C.acc, base + 0.14 * pw));
          ctx.fillStyle = g;
          if (pw > 0.7 || toca) { ctx.shadowColor = C.acc; ctx.shadowBlur = 7; }
        }
        ctx.fill(); ctx.shadowBlur = 0;
      });

      // nodos + plumas radiales finas
      orden.forEach(function (id) {
        var p = scr[id], a = ang[id], g = (datos.grado[id] || 0);
        var esSel = id === seleccionado, esVec = vecinos[id];
        var vivo = seleccionado === null || esSel || esVec;
        var fl = 4 + Math.min(9, g * 1.6);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0] + Math.cos(a) * fl, p[1] + Math.sin(a) * fl);
        ctx.strokeStyle = Q.alfa(vivo ? C.acc : C.t3, vivo ? 0.5 : 0.15); ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(p[0], p[1], esSel ? 4.6 : 2.4 + Math.min(2.4, g * 0.4), 0, 6.283);
        ctx.fillStyle = Q.alfa(esSel || esVec ? C.acc : C.t3, vivo ? 0.95 : 0.2);
        if (vivo) { ctx.shadowColor = C.acc; ctx.shadowBlur = esSel ? 8 : 4; }
        ctx.fill(); ctx.shadowBlur = 0;
      });

      // etiqueta del seleccionado o del hover
      var marca = seleccionado || hover;
      if (marca && scr[marca] && marca !== null) {
        var a2 = ang[marca], s2 = scr[marca];
        var txt = (etiquetaDe[marca] || marca).slice(0, 30);
        ctx.font = '700 11px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle'; ctx.textAlign = Math.cos(a2) >= 0 ? 'left' : 'right';
        var off = Math.cos(a2) >= 0 ? 10 : -10;
        ctx.lineWidth = 3; ctx.strokeStyle = C.fondo; ctx.strokeText(txt, s2[0] + off, s2[1]);
        ctx.fillStyle = C.acc; ctx.fillText(txt, s2[0] + off, s2[1]);
      }

      Q.brackets(ctx, w, h, C.acc);
    }

    // ── ficha ────────────────────────────────────────────────────────
    function pintarDetalle() {
      if (!seleccionado) {
        elDetalle.innerHTML = '<p class="qa-base-hint">Toca el anillo para aislar ' +
          'las cuerdas de un concepto; el resto se atenúa.</p>';
        return;
      }
      var nVec = datos.red.enlaces.reduce(function (acc, e) {
        return acc + (e.origen === seleccionado || e.destino === seleccionado ? 1 : 0);
      }, 0);
      elDetalle.innerHTML =
        '<div class="gr-kind">COMUNIDAD ' + Q.esc(datos.comunidad[seleccionado]) +
        ' · PESO ' + (datos.grado[seleccionado] || 0).toFixed(1) + '</div>' +
        '<div class="gr-nombre">' + Q.esc(etiquetaDe[seleccionado] || seleccionado) + '</div>' +
        '<p class="qa-lectura"><b>' + nVec + '</b> cuerdas tocan este concepto.</p>';
    }
    function pintarComunidades() {
      var secs = sectores();
      var html = '';
      secs.slice().sort(function (a, b) { return b.n - a.n; }).forEach(function (s) {
        html += '<div class="qa-caja"><span title="' + Q.esc(etiquetaDe[s.hub] || s.c) + '">' +
          Q.esc((etiquetaDe[s.hub] || s.c).slice(0, 22)) + '</span><b>×' + s.n + '</b></div>';
      });
      elComs.innerHTML = html;
    }

    function cargar() {
      fetch('/api/v1/autogenes/qualia/red').then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.error) { elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase(); return; }
        datos = j;
        etiquetaDe = {};
        datos.red.nodos.forEach(function (nd) { etiquetaDe[nd.id] = nd.etiqueta; });
        elInfo.textContent = j.red.nodos.length + ' CONCEPTOS EN EL ANILLO · ' +
          j.red.enlaces.length + ' CUERDAS · ORDEN POR COMUNIDAD';
        canvas.setAttribute('aria-label',
          'Cuerdas del caso: ' + j.red.nodos.length + ' conceptos en un anillo por comunidad, ' +
          j.red.enlaces.length + ' vínculos como cintas por peso. Las comunidades se listan a la derecha.');
        pintarDetalle(); pintarComunidades(); dibujar();
      }).catch(function () { elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }

    function idEnAngulo(x, y) {
      var a = Math.atan2(y - centro.y, x - centro.x) + Math.PI / 2;
      a = ((a % 6.283) + 6.283) % 6.283;
      var idx = Math.round((a / 6.283) * datos.orden.length) % datos.orden.length;
      return datos.orden[idx];
    }

    // ── gestos: pan + rueda + tap sobre el anillo, hover de vista previa ─
    var arrastre = { activo: false, movido: false, x: 0, y: 0 };
    canvas.addEventListener('pointerdown', function (ev) {
      canvas.setPointerCapture(ev.pointerId);
      arrastre.activo = true; arrastre.movido = false;
      arrastre.x = ev.clientX; arrastre.y = ev.clientY;
    });
    canvas.addEventListener('pointermove', function (ev) {
      var caja = canvas.getBoundingClientRect();
      if (arrastre.activo) {
        var dx = ev.clientX - arrastre.x, dy = ev.clientY - arrastre.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movido = true;
        if (arrastre.movido) {
          vista.x += dx; vista.y += dy; arrastre.x = ev.clientX; arrastre.y = ev.clientY; dibujar();
        }
        return;
      }
      if (!datos || !datos.orden.length) return;
      var id = idEnAngulo(ev.clientX - caja.left, ev.clientY - caja.top);
      if (id !== hover) { hover = id; canvas.style.cursor = 'pointer'; dibujar(); }
    });
    canvas.addEventListener('pointerup', function (ev) {
      var fueTap = arrastre.activo && !arrastre.movido;
      arrastre.activo = false;
      if (!fueTap || !datos || !datos.orden.length) return;
      var caja = canvas.getBoundingClientRect();
      var id = idEnAngulo(ev.clientX - caja.left, ev.clientY - caja.top);
      seleccionado = id === seleccionado ? null : id;
      // drill-down: la entidad tocada abre su dossier de negocio (Q4)
      if (seleccionado && window.QualiaDossier) {
        window.QualiaDossier.abrir(etiquetaDe[seleccionado] || seleccionado,
          { nodoId: seleccionado });
      }
      pintarDetalle(); dibujar();
    });
    canvas.addEventListener('pointerleave', function () { if (hover !== null) { hover = null; dibujar(); } });
    canvas.addEventListener('pointercancel', function () { arrastre.activo = false; });
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      vista.k = Math.min(6, Math.max(0.4, vista.k * Math.pow(1.0015, -ev.deltaY)));
      dibujar();
    }, { passive: false });

    if (window.QualiaExport) window.QualiaExport.montar({
      canvas: canvas, archivo: 'qualia-cuerdas',
      metodo: 'comunidades por propagación de etiquetas · peso del vínculo',
      datos: function () {
        if (!datos || !datos.orden) return { headers: [], filas: [] };
        var cuenta = {};
        datos.orden.forEach(function (id) {
          var c = datos.comunidad[id]; cuenta[c] = (cuenta[c] || 0) + 1;
        });
        var filas = Object.keys(cuenta).map(function (c) {
          return [c, cuenta[c]];
        }).sort(function (a, b) { return b[1] - a[1]; });
        return { headers: ['comunidad', 'entidades'], filas: filas };
      }
    });
    C = Q.leerColores();
    window.addEventListener('resize', dibujar);
    Q.alTema(function () { C = Q.leerColores(); dibujar(); });
    cargar();
  });
})();
