/* GNOSIS · Qualia — Cuerdas (F7d, port de LienzoCuerdas).
   Los nodos sobre un anillo en ORDEN DE COMUNIDAD (el mismo orden que
   computa el motor: comunidades contiguas, ticks en las fronteras de
   sector) y cada vínculo como cuerda cuadrática arqueada al centro,
   grosor ∝ peso. Tocar el anillo aísla las cuerdas de un concepto; el
   resto se atenúa a tinta fantasma. Navegable (arrastre + rueda) para
   leer un anillo denso en vez de verlo colapsar en borrón. Estático:
   nada que congelar. Trazos con la variante AAA por modo.
   Datos: /api/v1/autogenes/qualia/red (incluye el orden del motor). */
(function () {
  'use strict';

  var R = 400;   // radio del anillo en unidades de mundo

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qd-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var elInfo = document.getElementById('qd-info');
    var elDetalle = document.getElementById('qd-detalle');
    var elComs = document.getElementById('qd-comunidades');

    var colores = {};
    var datos = null;
    var seleccionado = null;
    var vista = { x: 0, y: 0, k: 1 };
    var centro = { x: 0, y: 0 };

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
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA',
        fondo: cs.getPropertyValue('--surface').trim() || '#0A0A0A'
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

    function dibujar() {
      if (!datos) return;
      tamano();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var orden = datos.orden, n = orden.length;
      ctx.clearRect(0, 0, w, h);
      if (n === 0) return;

      var m = 60;
      var k = 0.92 * Math.min((w - 2 * m) / (2 * R), (h - 2 * m) / (2 * R)) * vista.k;
      function P(x, y) {
        return [w / 2 + x * k + vista.x, h / 2 + y * k + vista.y];
      }
      var c0 = P(0, 0);
      centro = { x: c0[0], y: c0[1] };

      var scr = {}, ang = {};
      orden.forEach(function (id, i) {
        var a = (i / n) * 6.283 - Math.PI / 2;
        ang[id] = a;
        scr[id] = P(Math.cos(a) * R, Math.sin(a) * R);
      });

      // ticks en las fronteras de sector (comunidades contiguas)
      var previa;
      orden.forEach(function (id, i) {
        var c = datos.comunidad[id];
        if (c !== previa) {
          var a = (i / n) * 6.283 - Math.PI / 2 - Math.PI / n;
          var p0 = P(Math.cos(a) * R * 1.04, Math.sin(a) * R * 1.04);
          var p1 = P(Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12);
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
          ctx.strokeStyle = alfa(colores.linea, 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
          previa = c;
        }
      });

      // cuerdas: arqueadas al centro; con selección, el resto se apaga
      datos.red.enlaces.forEach(function (e) {
        var A = scr[e.origen], B = scr[e.destino];
        if (!A || !B) return;
        var toca = seleccionado !== null &&
          (e.origen === seleccionado || e.destino === seleccionado);
        var color = colores.t3, av = 0.14;
        if (seleccionado !== null) {
          color = toca ? colores.acc : colores.linea;
          av = toca ? 0.52 : 0.04;
        }
        ctx.beginPath();
        ctx.moveTo(A[0], A[1]);
        ctx.quadraticCurveTo(centro.x, centro.y, B[0], B[1]);
        ctx.strokeStyle = alfa(color, av);
        ctx.lineWidth = 0.6 + Math.min(e.peso || 0.5, 6) * 0.3;
        ctx.stroke();
      });

      // nodos del anillo
      var vecinos = {};
      if (seleccionado) {
        datos.red.enlaces.forEach(function (e) {
          if (e.origen === seleccionado) vecinos[e.destino] = true;
          if (e.destino === seleccionado) vecinos[e.origen] = true;
        });
      }
      orden.forEach(function (id) {
        var s = scr[id];
        var esSel = id === seleccionado;
        var esVec = vecinos[id];
        var activo = seleccionado === null || esSel || esVec;
        ctx.beginPath();
        ctx.arc(s[0], s[1], esSel ? 4.6 : 2.8, 0, 6.283);
        ctx.fillStyle = alfa(esSel || esVec ? colores.acc : colores.t3,
                             activo ? 0.92 : 0.2);
        ctx.fill();
      });

      // etiqueta del seleccionado, con halo, hacia afuera del anillo
      if (seleccionado && scr[seleccionado]) {
        var a2 = ang[seleccionado];
        var s2 = scr[seleccionado];
        var nodo = datos.red.nodos.find(function (x) { return x.id === seleccionado; });
        if (nodo) {
          ctx.font = '700 11px "JetBrains Mono", monospace';
          ctx.textBaseline = 'middle';
          ctx.textAlign = Math.cos(a2) >= 0 ? 'left' : 'right';
          var off = Math.cos(a2) >= 0 ? 8 : -8;
          ctx.lineWidth = 3;
          ctx.strokeStyle = colores.fondo;
          ctx.strokeText(nodo.etiqueta.slice(0, 30), s2[0] + off, s2[1]);
          ctx.fillStyle = colores.acc;
          ctx.fillText(nodo.etiqueta.slice(0, 30), s2[0] + off, s2[1]);
        }
      }

      // brackets de esquina
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
      [[8, 8, 22, 8, 8, 22], [w - 8, 8, w - 22, 8, w - 8, 22],
       [8, h - 8, 22, h - 8, 8, h - 22], [w - 8, h - 8, w - 22, h - 8, w - 8, h - 22]]
        .forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[4], c[5]); ctx.stroke();
        });
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }

    // ── ficha ────────────────────────────────────────────────────────
    function pintarDetalle() {
      if (!seleccionado) {
        elDetalle.innerHTML = '<p class="qa-base-hint">Toca el anillo para aislar ' +
          'las cuerdas de un concepto; el resto se atenúa.</p>';
        return;
      }
      var nodo = datos.red.nodos.find(function (x) { return x.id === seleccionado; });
      var nVec = datos.red.enlaces.reduce(function (acc, e) {
        return acc + (e.origen === seleccionado || e.destino === seleccionado ? 1 : 0);
      }, 0);
      elDetalle.innerHTML =
        '<div class="gr-kind">COMUNIDAD ' + esc(datos.comunidad[seleccionado]) +
        ' · GRADO ' + (datos.grado[seleccionado] || 0).toFixed(1) + '</div>' +
        '<div class="gr-nombre">' + esc(nodo ? nodo.etiqueta : seleccionado) + '</div>' +
        '<p class="qa-lectura"><b>' + nVec + '</b> cuerdas tocan este concepto.</p>';
    }
    function pintarComunidades() {
      var tam = {};
      datos.orden.forEach(function (id) {
        var c = datos.comunidad[id];
        tam[c] = (tam[c] || 0) + 1;
      });
      var etiquetaDe = {};
      datos.red.nodos.forEach(function (nd) { etiquetaDe[nd.id] = nd.etiqueta; });
      // el hub (primer id del sector en el orden) da nombre a la comunidad
      var hubDe = {};
      datos.orden.forEach(function (id) {
        var c = datos.comunidad[id];
        if (!(c in hubDe)) hubDe[c] = id;
      });
      var html = '';
      Object.keys(tam).sort(function (a, b) { return tam[b] - tam[a]; })
        .forEach(function (c) {
          html += '<div class="qa-caja"><span title="' +
            esc(etiquetaDe[hubDe[c]] || c) + '">' +
            esc((etiquetaDe[hubDe[c]] || c).slice(0, 22)) + '</span><b>×' +
            tam[c] + '</b></div>';
        });
      elComs.innerHTML = html;
    }

    function cargar() {
      fetch('/api/v1/autogenes/qualia/red')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) {
            elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase();
            return;
          }
          datos = j;
          elInfo.textContent = j.red.nodos.length + ' CONCEPTOS EN EL ANILLO · ' +
            j.red.enlaces.length + ' CUERDAS · ORDEN POR COMUNIDAD';
          pintarDetalle();
          pintarComunidades();
          dibujar();
        })
        .catch(function () {
          elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
        });
    }

    // ── gestos: pan + rueda + tap sobre el anillo ────────────────────
    var arrastre = { activo: false, movido: false, x: 0, y: 0 };
    canvas.addEventListener('pointerdown', function (ev) {
      canvas.setPointerCapture(ev.pointerId);
      arrastre.activo = true; arrastre.movido = false;
      arrastre.x = ev.clientX; arrastre.y = ev.clientY;
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!arrastre.activo) return;
      var dx = ev.clientX - arrastre.x, dy = ev.clientY - arrastre.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movido = true;
      if (arrastre.movido) {
        vista.x += dx; vista.y += dy;
        arrastre.x = ev.clientX; arrastre.y = ev.clientY;
        dibujar();
      }
    });
    canvas.addEventListener('pointerup', function (ev) {
      var fueTap = arrastre.activo && !arrastre.movido;
      arrastre.activo = false;
      if (!fueTap || !datos || !datos.orden.length) return;
      var caja = canvas.getBoundingClientRect();
      var x = ev.clientX - caja.left, y = ev.clientY - caja.top;
      var a = Math.atan2(y - centro.y, x - centro.x) + Math.PI / 2;
      a = ((a % 6.283) + 6.283) % 6.283;
      var idx = Math.round((a / 6.283) * datos.orden.length) % datos.orden.length;
      var id = datos.orden[idx];
      seleccionado = id === seleccionado ? null : id;
      pintarDetalle();
      dibujar();
    });
    canvas.addEventListener('pointercancel', function () { arrastre.activo = false; });
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      vista.k = Math.min(6, Math.max(0.4, vista.k * Math.pow(1.0015, -ev.deltaY)));
      dibujar();
    }, { passive: false });

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
