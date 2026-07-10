/* GNOSIS · Dendro — el mapa de ingesta (port de DendrogramaCanvas).
   Dendrograma radial de la ontología completa desde /api/v1/autogenes/
   arbol: el núcleo (sesión) al centro, ramas por anillo de profundidad,
   apertura angular proporcional al tamaño real de cada subárbol.
   Lienzo estático — sin física, sin motion (nada que congelar).
   Tap sobre un nodo → línea de inspección. Redibuja al redimensionar
   y al cambiar de tema. Datos reales; los rollups "+N más" del árbol
   se dibujan como agregados, nunca se ocultan en silencio. */
(function () {
  'use strict';

  function montar(cont) {
    var canvas = cont.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var info = document.querySelector(cont.getAttribute('data-info') || '') || null;
    var colores = {}, nodos = [];   // nodos pintados con posición (para el tap)
    var arbol = null;

    function leerColores() {
      var cs = getComputedStyle(document.documentElement);
      colores = {
        acc: cs.getPropertyValue('--acc-text').trim() || '#00D4FF',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        linea2: cs.getPropertyValue('--line-2').trim() || '#777',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA'
      };
    }

    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = Math.max(430, caja.height) * dpr;
      canvas.style.height = Math.max(430, caja.height) + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function profundidadMax(rama, d) {
      if (!rama.hijos || !rama.hijos.length) return d;
      return Math.max.apply(null, rama.hijos.map(function (h) {
        return profundidadMax(h, d + 1);
      }));
    }

    function dibujar() {
      if (!arbol) return;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      var cx = w / 2, cy = h / 2;
      var maxD = Math.max(1, profundidadMax(arbol, 0));
      var paso = (Math.min(w, h) / 2 - 56) / maxD;
      nodos = [];

      function color(kind) {
        return kind === 'entidad' ? colores.acc
             : kind === 'nucleo' ? colores.acc
             : kind === 'agregado' ? colores.t3 : colores.linea2;
      }

      // asignación angular recursiva ∝ tamaño del subárbol
      (function pintar(rama, d, a0, a1, px, py) {
        var ang = (a0 + a1) / 2;
        var r = d * paso;
        var x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
        if (d > 0) {
          // codo Z.O.E.: radial hasta el anillo del padre + arco corto
          ctx.strokeStyle = colores.linea;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        var rad = rama.kind === 'nucleo' ? 7
                : rama.kind === 'campo' ? 4.5
                : rama.kind === 'artefacto' ? 4 : 2.6;
        rad += Math.min(4, Math.log2((rama.tamano || 1) + 1));
        ctx.beginPath();
        if (rama.kind === 'artefacto') {
          ctx.rect(x - rad, y - rad, rad * 2, rad * 2);
        } else {
          ctx.arc(x, y, rad, 0, 6.283);
        }
        ctx.strokeStyle = color(rama.kind);
        ctx.fillStyle = rama.kind === 'nucleo' ? colores.acc : 'transparent';
        ctx.lineWidth = 1.1;
        if (rama.kind === 'nucleo') ctx.fill();
        ctx.stroke();
        nodos.push({ x: x, y: y, r: rad + 8, rama: rama });

        if (d <= 1 || rama.kind === 'artefacto' || rama.kind === 'agregado') {
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillStyle = d === 0 ? colores.t1 : colores.t3;
          ctx.textAlign = ang > 1.5708 && ang < 4.7124 && d > 0 ? 'right' : d === 0 ? 'center' : 'left';
          var lx = d === 0 ? x : x + Math.cos(ang) * (rad + 5);
          var ly = d === 0 ? y + rad + 13 : y + Math.sin(ang) * (rad + 5) + 3;
          ctx.fillText((rama.etiqueta || '').slice(0, 22), lx, ly);
        }

        var total = (rama.hijos || []).reduce(function (t, hijo) {
          return t + Math.max(hijo.tamano || 1, 1);
        }, 0) || 1;
        var cursor = a0;
        (rama.hijos || []).forEach(function (hijo) {
          var porcion = (a1 - a0) * Math.max(hijo.tamano || 1, 1) / total;
          pintar(hijo, d + 1, cursor, cursor + porcion, x, y);
          cursor += porcion;
        });
      })(arbol, 0, -Math.PI / 2, 1.5 * Math.PI, cx, cy);
    }

    canvas.addEventListener('click', function (ev) {
      var caja = canvas.getBoundingClientRect();
      var mx = ev.clientX - caja.left, my = ev.clientY - caja.top;
      var mejor = null, mejorD = 1e9;
      nodos.forEach(function (n) {
        var d = (n.x - mx) * (n.x - mx) + (n.y - my) * (n.y - my);
        if (d < n.r * n.r && d < mejorD) { mejor = n; mejorD = d; }
      });
      if (info && mejor) {
        info.textContent = (mejor.rama.kind || '').toUpperCase() + ' · ' +
          mejor.rama.etiqueta + ' · ' + (mejor.rama.tamano || 1) + ' elementos';
      }
    });

    function cargar() {
      fetch('/api/v1/autogenes/arbol')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) {
            if (info) info.textContent = (j && j.error) || 'SIN DATOS';
            return;
          }
          arbol = j.arbol;
          dibujar();
          if (info) info.textContent = 'SESIÓN ' + j.session_id +
            ' · ' + (arbol.tamano || 0) + ' ELEMENTOS EN EL MAPA';
        })
        .catch(function () { if (info) info.textContent = 'SIN CONEXIÓN'; });
    }

    leerColores();
    tamano();
    window.addEventListener('resize', function () { tamano(); dibujar(); });
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); dibujar(); }, 60);
    });
    cont.dendroAPI = { recargar: cargar };
    cargar();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.dn-lienzo').forEach(montar);
  });
})();
