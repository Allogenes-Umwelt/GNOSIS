/* GNOSIS · Dendro — el mapa de ingesta, biomecánico e interactivo.
   Dendrograma horizontal de la ontología (/api/v1/autogenes/arbol): núcleo
   a la izquierda, profundidad hacia la derecha, hojas apiladas en vertical
   (cada rama interna se centra en sus hijos). Estética biomech: núcleo+halo
   con glow, aristas curvas orgánicas (bézier horizontal). INTERACTIVO: clic
   en un nodo con hijos abre/cierra su rama (múltiples a la vez); un nodo
   colapsado muestra «+n». Datos reales; los rollups «+N más» del árbol se
   dibujan como agregados, nunca se ocultan en silencio. Las etiquetas nunca
   se recortan en los bordes. Retina-nítido; redibuja al redimensionar y
   cambiar tema. */
(function () {
  'use strict';

  function montar(cont) {
    var canvas = cont.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var info = document.querySelector(cont.getAttribute('data-info') || '') || null;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var colores = {}, nodos = [];        // nodos pintados con posición y clave
    var arbol = null;
    var colapsados = {};                 // clave -> true (rama cerrada)
    var hover = null;

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

    function conAlfa(hex, a) {
      var h = (hex || '#00D4FF').replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
             ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }

    var cssW = 0, cssH = 0;
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      cssW = caja.width;
      cssH = Math.max(430, caja.height);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Profundidad visible: una rama colapsada no aporta profundidad.
    function profundidadMax(rama, d, clave) {
      if (colapsados[clave] || !rama.hijos || !rama.hijos.length) return d;
      return Math.max.apply(null, rama.hijos.map(function (h, i) {
        return profundidadMax(h, d + 1, clave + '.' + i);
      }));
    }

    function radioDe(rama) {
      var base = rama.kind === 'nucleo' ? 8 : rama.kind === 'campo' ? 5
               : rama.kind === 'artefacto' ? 4.5 : rama.kind === 'entidad' ? 4 : 2.6;
      return base + Math.min(4.5, Math.log2((rama.tamano || 1) + 1));
    }

    function esVivo(kind) { return kind === 'entidad' || kind === 'nucleo'; }

    // Layout de árbol prolijo, horizontal: asigna a cada nodo visible una
    // fila (hoja) y una columna (profundidad); las ramas internas se centran
    // en el rango de sus hijos. Devuelve la lista plana con posiciones.
    function disponer(w, h) {
      var maxD = Math.max(1, profundidadMax(arbol, 0, '0'));
      var padL = 96, padR = 168, padT = 30, padB = 26;
      var xPaso = maxD > 0 ? (w - padL - padR) / maxD : 0;
      var fila = 0;                         // contador de hojas visibles
      var plano = [];
      function recorrer(rama, d, clave) {
        var cerrado = colapsados[clave];
        var hijos = (rama.hijos || []);
        var x = padL + d * xPaso;
        var nodo = { rama: rama, clave: clave, d: d, x: x, y: 0,
                     hijos: hijos.length, cerrado: !!cerrado };
        plano.push(nodo);
        if (cerrado || !hijos.length) {     // hoja visible → nueva fila
          nodo.fila = fila; fila += 1;
          nodo._hoja = true;
          return nodo;
        }
        var hs = hijos.map(function (hj, i) { return recorrer(hj, d + 1, clave + '.' + i); });
        nodo.filaMin = hs[0].filaMin !== undefined ? hs[0].filaMin : hs[0].fila;
        nodo.filaMax = hs[hs.length - 1].filaMax !== undefined ? hs[hs.length - 1].filaMax : hs[hs.length - 1].fila;
        nodo.fila = (nodo.filaMin + nodo.filaMax) / 2;
        nodo.centroDe = hs;
        return nodo;
      }
      recorrer(arbol, 0, '0');
      var filas = Math.max(1, fila);
      var yPaso = filas > 1 ? (h - padT - padB) / (filas - 1) : 0;
      var yBase = filas > 1 ? padT : h / 2;
      plano.forEach(function (n) { n.y = Math.round(yBase + n.fila * yPaso); });
      return plano;
    }

    function dibujar() {
      if (!arbol) return;
      var w = cssW, h = cssH;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodos = [];
      var plano = disponer(w, h);
      var porClave = {};
      plano.forEach(function (n) { porClave[n.clave] = n; });

      // ── aristas primero (bézier horizontal orgánica) ──
      plano.forEach(function (n) {
        if (!n.centroDe) return;
        n.centroDe.forEach(function (hijo) {
          var mx = (n.x + hijo.x) / 2;
          ctx.strokeStyle = colores.linea2;
          ctx.globalAlpha = 0.42;
          ctx.lineWidth = Math.max(0.8, 1.7 - n.d * 0.22);
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.bezierCurveTo(mx, n.y, mx, hijo.y, hijo.x, hijo.y);
          ctx.stroke();
        });
      });
      ctx.globalAlpha = 1;

      // ── nodos + etiquetas ──
      plano.forEach(function (n) {
        var rama = n.rama, x = n.x, y = n.y;
        var rad = radioDe(rama);
        var vivo = esVivo(rama.kind);
        var esHover = hover && hover.clave === n.clave;

        if (vivo || rama.kind === 'campo' || rama.kind === 'artefacto' || esHover) {
          ctx.shadowColor = conAlfa(colores.acc, esHover ? 0.95 : 0.7);
          ctx.shadowBlur = (rama.kind === 'nucleo' ? 18 : 11) + (esHover ? 6 : 0);
        }
        ctx.beginPath();
        if (rama.kind === 'artefacto') {
          ctx.rect(x - rad, y - rad, rad * 2, rad * 2);
        } else {
          ctx.arc(x, y, rad, 0, 6.283);
        }
        ctx.strokeStyle = vivo ? colores.acc
          : (rama.kind === 'campo' || rama.kind === 'artefacto') ? colores.t1 : colores.linea2;
        ctx.fillStyle = vivo ? conAlfa(colores.acc, 0.28) : 'rgba(0,0,0,0)';
        ctx.lineWidth = esHover ? 2 : (vivo || rama.kind === 'campo' ? 1.6 : 1.1);
        if (vivo) ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        // singularidad interior de los nodos clave
        if (rama.kind === 'nucleo' || rama.kind === 'campo') {
          ctx.beginPath(); ctx.arc(x, y, Math.max(1.4, rad * 0.34), 0, 6.283);
          ctx.fillStyle = colores.acc; ctx.fill();
        }
        // marcador de rama cerrada: anillo punteado
        if (n.cerrado && n.hijos) {
          ctx.beginPath(); ctx.arc(x, y, rad + 4, 0, 6.283);
          ctx.strokeStyle = conAlfa(colores.acc, 0.5); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
          ctx.stroke(); ctx.setLineDash([]);
        }
        nodos.push({ x: x, y: y, r: rad + 9, rama: rama, clave: n.clave, hijos: n.hijos });

        // etiqueta: raíz encima; hojas/colapsados/hover/artefacto a la derecha.
        var esHoja = n._hoja || (n.cerrado && n.hijos);
        var mostrar = n.d <= 1 || rama.kind === 'artefacto' || rama.kind === 'agregado'
          || esHoja || esHover;
        if (mostrar) {
          ctx.font = '10px "JetBrains Mono", monospace';
          var texto = String(rama.etiqueta || '').slice(0, 24) +
            (n.cerrado && n.hijos ? '  +' + n.hijos : '');
          ctx.fillStyle = (n.d === 0 || esHover) ? colores.t1 : colores.t3;
          if (n.d === 0) {                   // raíz: etiqueta centrada encima
            ctx.textAlign = 'center';
            ctx.fillText(texto, x, y - rad - 8);
          } else {                           // resto: a la derecha del nodo
            ctx.textAlign = 'left';
            ctx.fillText(texto, x + rad + 7, y + 3);
          }
        }
      });
    }

    function nodoEn(mx, my) {
      var mejor = null, mejorD = 1e9;
      nodos.forEach(function (n) {
        var dd = (n.x - mx) * (n.x - mx) + (n.y - my) * (n.y - my);
        if (dd < n.r * n.r && dd < mejorD) { mejor = n; mejorD = dd; }
      });
      return mejor;
    }

    canvas.addEventListener('click', function (ev) {
      var caja = canvas.getBoundingClientRect();
      var n = nodoEn(ev.clientX - caja.left, ev.clientY - caja.top);
      if (!n) return;
      if (n.hijos) {                       // abre/cierra su rama
        colapsados[n.clave] = !colapsados[n.clave];
        dibujar();
      }
      if (info) {
        info.textContent = (n.rama.kind || '').toUpperCase() + ' · ' + n.rama.etiqueta +
          ' · ' + (n.rama.tamano || 1) + ' elementos' +
          (n.hijos ? (colapsados[n.clave] ? ' · [cerrado]' : ' · [abierto]') : '');
      }
    });

    canvas.addEventListener('mousemove', function (ev) {
      var caja = canvas.getBoundingClientRect();
      var n = nodoEn(ev.clientX - caja.left, ev.clientY - caja.top);
      var nuevo = n ? { clave: n.clave } : null;
      var cambio = (!!nuevo !== !!hover) || (nuevo && hover && nuevo.clave !== hover.clave);
      hover = nuevo;
      canvas.style.cursor = (n && n.hijos) ? 'pointer' : 'default';
      if (cambio) dibujar();
    });
    canvas.addEventListener('mouseleave', function () { if (hover) { hover = null; dibujar(); } });

    function cargar() {
      fetch('/api/v1/autogenes/arbol')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) { if (info) info.textContent = (j && j.error) || 'SIN DATOS'; return; }
          arbol = j.arbol;
          dibujar();
          if (info) info.textContent = 'SESIÓN ' + j.session_id +
            ' · ' + (arbol.tamano || 0) + ' ELEMENTOS';
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
