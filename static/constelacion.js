/* GNOSIS · Constelación cristalográfica — el selector navegable.
   Un componente, dos alcances:
     scope="app"       → celda primitiva (home): AUTOGENES expandible + accesos.
     scope="autogenes" → celda completa (/autogenes): 4 ejes + satélites.
   Gramática P3₂ + trazo Z.O.E.: triángulos = ejes (dashboards) con facetas
   y puntas de vértice; círculos = instrumentos con arco de acento y su
   fracción como dato vivo; centro = GNOSIS·IA con anillo en rotación;
   radios con codo (dog-leg) tipo traza de circuito; esquirlas radiantes
   de fondo. SVG puro: <a> reales, foco de teclado, hover CSS; toda
   animación se congela con prefers-reduced-motion. Ley: toda figura
   carga métrica real o se marca latente — nunca un adorno. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  // determinista: nada de Math.random — la constelación es idéntica en cada carga
  function ruido(i) { return ((i * 2654435761) % 1000) / 1000; }

  function triangulo(x, y, r) {
    var h = r * 0.866;
    return 'M' + x + ',' + (y - r) + ' L' + (x - h) + ',' + (y + r / 2) +
           ' L' + (x + h) + ',' + (y + r / 2) + ' Z';
  }

  function fmt(v, sufijo) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number' && v >= 10000) return (v / 1000).toFixed(1) + 'k';
    return String(v) + (sufijo || '');
  }

  // ── Definición de figuras por alcance ────────────────────────────
  function figuras(scope, est) {
    var E = est || {};
    if (scope === 'app') {
      return {
        viewBox: '0 0 360 300',
        celda: [[52, 268], [252, 268], [308, 96], [108, 96]],
        esquirlas: 5,
        nodos: [
          { id: 'ia', forma: 'centro', x: 172, y: 178, r: 15,
            etiqueta: 'GNOSIS·IA', accion: 'consola',
            titulo: 'Abrir la consola GNOSIS·IA' },
          { id: 'autogenes', forma: 'triangulo', x: 262, y: 122, r: 17,
            etiqueta: 'AUTOGENES', href: '/autogenes', expandible: true,
            sub: [
              { id: 'concilia', forma: 'triangulo', x: 176, y: 40, r: 10,
                etiqueta: 'I·CONCILIA', href: '/autogenes/concilia',
                valor: fmt(E.conciliado_pct, '%'), alerta: (E.faltantes || 0) > 0 },
              { id: 'validacion', forma: 'triangulo', x: 262, y: 30, r: 10,
                etiqueta: 'II·VALIDACIÓN', href: '/autogenes/validacion',
                valor: fmt(E.errores), alerta: (E.errores || 0) > 0 },
              { id: 'sinapsis', forma: 'triangulo', x: 340, y: 68, r: 10,
                etiqueta: 'III·SINAPSIS', href: '/autogenes/sinapsis',
                valor: fmt(E.relaciones) },
              { id: 'nomos', forma: 'triangulo', x: 348, y: 152, r: 10,
                etiqueta: 'IV·NOMOS', href: '/autogenes/nomos',
                valor: fmt(E.reglas), latente: E.reglas == null }
            ] },
          { id: 'tableros', forma: 'circulo', x: 92, y: 128, r: 13,
            etiqueta: 'Tableros', accion: 'tableros',
            valor: fmt(E.vehiculos), titulo: 'Tableros aduanales de la sesión' },
          { id: 'areas', forma: 'circulo', x: 78, y: 238, r: 13,
            etiqueta: 'Áreas', href: '/procesar', valor: fmt(E.facturas) },
          { id: 'errores', forma: 'circulo', x: 238, y: 244, r: 13,
            etiqueta: 'Errores', href: '/errores', valor: fmt(E.errores),
            alerta: (E.errores || 0) > 0 }
        ]
      };
    }
    // scope === 'autogenes' — la celda completa
    return {
      viewBox: '0 0 900 620',
      celda: [[170, 520], [660, 520], [800, 130], [310, 130]],
      esquirlas: 9,
      nodos: [
        { id: 'ia', forma: 'centro', x: 485, y: 325, r: 20,
          etiqueta: 'GNOSIS·IA', accion: 'consola',
          titulo: 'Abrir la consola GNOSIS·IA' },
        { id: 'concilia', forma: 'triangulo', x: 170, y: 520, r: 26,
          etiqueta: 'I · CONCILIA', href: '/autogenes/concilia',
          valor: fmt(E.conciliado_pct, '%'), alerta: (E.faltantes || 0) > 0 },
        { id: 'validacion', forma: 'triangulo', x: 660, y: 520, r: 26,
          etiqueta: 'II · VALIDACIÓN', href: '/autogenes/validacion',
          valor: fmt(E.errores), alerta: (E.errores || 0) > 0 },
        { id: 'sinapsis', forma: 'triangulo', x: 800, y: 130, r: 26,
          etiqueta: 'III · SINAPSIS', href: '/autogenes/sinapsis',
          valor: fmt(E.relaciones) },
        { id: 'nomos', forma: 'triangulo', x: 310, y: 130, r: 26,
          etiqueta: 'IV · NOMOS', href: '/autogenes/nomos',
          valor: fmt(E.reglas), latente: E.reglas == null },
        { id: 'grafo', forma: 'circulo', x: 360, y: 400, r: 15,
          etiqueta: 'Grafo', href: '/autogenes/grafo', valor: fmt(E.entidades) },
        { id: 'ingesta', forma: 'circulo', x: 620, y: 260, r: 15,
          etiqueta: 'Ingesta', href: '/autogenes/ingesta', valor: fmt(E.artefactos) },
        { id: 'radar', forma: 'circulo', x: 585, y: 415, r: 15,
          etiqueta: 'Radar', href: '/autogenes/radar', valor: fmt(E.senales),
          latente: E.senales == null },
        { id: 'vinculos', forma: 'circulo', x: 415, y: 245, r: 15,
          etiqueta: 'Vínculos', href: '/autogenes/vinculos',
          valor: fmt(E.productos_camino) },
        { id: 'sintesis', forma: 'circulo', x: 265, y: 320, r: 15,
          etiqueta: 'Síntesis', href: '/autogenes/sintesis',
          valor: fmt(E.productos_informe) },
        { id: 'qualia', forma: 'circulo', x: 700, y: 345, r: 15,
          etiqueta: 'Qualia', href: '/autogenes/qualia', valor: fmt(E.anomalias),
          latente: E.anomalias == null }
      ]
    };
  }

  // ── Trazo Z.O.E.: línea con codo (dog-leg) + tick en el quiebre ──
  function trazoAngular(svg, a, b, i, clase) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var px = -dy / len, py = dx / len;                 // perpendicular
    var o = (ruido(i + 3) - 0.5) * 0.22 * len;         // desvío del codo
    var t1 = 0.42 + ruido(i + 7) * 0.14, t2 = t1 + 0.16;
    var p1 = [a[0] + dx * t1 + px * o, a[1] + dy * t1 + py * o];
    var p2 = [a[0] + dx * t2 + px * o, a[1] + dy * t2 + py * o];
    svg.appendChild(el('path', {
      d: 'M' + a[0] + ',' + a[1] + ' L' + p1[0] + ',' + p1[1] +
         ' L' + p2[0] + ',' + p2[1] + ' L' + b[0] + ',' + b[1],
      'class': clase || 'cst-radio'
    }));
    // tick de circuito en el codo
    svg.appendChild(el('line', {
      x1: p1[0] - px * 4, y1: p1[1] - py * 4,
      x2: p1[0] + px * 4, y2: p1[1] + py * 4, 'class': 'cst-tick'
    }));
  }

  // esquinas de la celda: marcas de corte (brackets)
  function brackets(svg, v, i) {
    var a = ruido(i + 11) * 6.283;
    var c = Math.cos(a), s = Math.sin(a);
    svg.appendChild(el('line', { x1: v[0] - 12 * c, y1: v[1] - 12 * s,
                                 x2: v[0] - 4 * c, y2: v[1] - 4 * s, 'class': 'cst-bracket' }));
    svg.appendChild(el('line', { x1: v[0] + 4 * s, y1: v[1] - 4 * c,
                                 x2: v[0] + 12 * s, y2: v[1] - 12 * c, 'class': 'cst-bracket' }));
  }

  // esquirlas radiantes (el plumaje del mecha): cuñas finas y largas
  function esquirlas(svg, cx, cy, n, escala) {
    var g = el('g', { 'class': 'cst-esquirlas', 'aria-hidden': 'true' });
    for (var i = 0; i < n; i++) {
      var ang = 2.6 + ruido(i * 13 + 1) * 1.5;         // abanico superior-izquierdo
      var dist = (30 + ruido(i * 7 + 2) * 55) * escala;
      var largo = (26 + ruido(i * 17 + 5) * 90) * escala;
      var ancho = (1.5 + ruido(i * 23 + 3) * 2.5) * escala;
      var x0 = cx + Math.cos(ang) * dist, y0 = cy + Math.sin(ang) * dist * 0.7;
      var x1 = x0 + Math.cos(ang) * largo, y1 = y0 + Math.sin(ang) * largo * 0.7;
      var px = -Math.sin(ang) * ancho, py = Math.cos(ang) * ancho;
      var sh = el('path', {
        d: 'M' + x0 + ',' + y0 + ' L' + (x1 + px) + ',' + (y1 + py) +
           ' L' + (x1 - px) + ',' + (y1 - py) + ' Z',
        'class': 'cst-esquirla'
      });
      sh.style.opacity = (0.10 + ruido(i * 31 + 9) * 0.16).toFixed(2);
      sh.style.animationDuration = (14 + (i % 5) * 3) + 's';
      sh.style.animationDelay = (-(i * 2.3) % 12) + 's';
      g.appendChild(sh);
    }
    svg.appendChild(g);
  }

  // ── Render de una figura ─────────────────────────────────────────
  function pintarNodo(svg, n, idx) {
    var g;
    var esEnlace = !!n.href && !n.expandible;
    if (esEnlace) {
      g = el('a', { href: n.href, 'aria-label': n.etiqueta + ' · ' + (n.valor || '') });
    } else {
      g = el('g', { tabindex: '0', role: 'button',
                    'aria-label': n.titulo || n.etiqueta });
    }
    g.classList.add('cst-fig', 'cst-' + n.forma);
    if (n.latente) g.classList.add('cst-latente');
    if (n.alerta) g.classList.add('cst-alerta');

    var deriva = el('g', {});
    deriva.classList.add('cst-deriva');
    deriva.style.animationDuration = (9 + (idx % 5) * 2.4) + 's';
    deriva.style.animationDelay = (-(idx * 1.7) % 8) + 's';

    // zona táctil ≥48px
    deriva.appendChild(el('circle', { cx: n.x, cy: n.y, r: Math.max(n.r + 14, 26),
                                      'class': 'cst-hit' }));
    var giro = (ruido(idx * 5 + 2) * 360).toFixed(0);
    if (n.forma === 'triangulo') {
      deriva.appendChild(el('path', { d: triangulo(n.x, n.y, n.r), 'class': 'cst-forma' }));
      // faceta interna desplazada (blindaje Shinkawa)
      deriva.appendChild(el('path', {
        d: triangulo(n.x + n.r * 0.14, n.y + n.r * 0.12, n.r * 0.52),
        'class': 'cst-faceta'
      }));
      // puntas: los vértices se prolongan como filos
      var h = n.r * 0.866, pts = [[n.x, n.y - n.r, 0, -1],
                                  [n.x - h, n.y + n.r / 2, -0.87, 0.5],
                                  [n.x + h, n.y + n.r / 2, 0.87, 0.5]];
      pts.forEach(function (p) {
        deriva.appendChild(el('line', {
          x1: p[0], y1: p[1], x2: p[0] + p[2] * n.r * 0.55, y2: p[1] + p[3] * n.r * 0.55,
          'class': 'cst-punta'
        }));
      });
    } else if (n.forma === 'centro') {
      deriva.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r, 'class': 'cst-forma' }));
      deriva.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r * 0.45, 'class': 'cst-nucleo' }));
      // anillo exterior punteado en rotación lenta
      deriva.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r * 1.6,
                                        'class': 'cst-anillo' }));
    } else {
      deriva.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r, 'class': 'cst-forma' }));
      // arco de acento (un cuarto de órbita, orientación por seed)
      deriva.appendChild(el('circle', {
        cx: n.x, cy: n.y, r: n.r + 4, 'class': 'cst-arco',
        transform: 'rotate(' + giro + ' ' + n.x + ' ' + n.y + ')'
      }));
      // filo tangencial
      deriva.appendChild(el('line', {
        x1: n.x + n.r + 4, y1: n.y, x2: n.x + n.r + 12, y2: n.y - 6,
        'class': 'cst-punta',
        transform: 'rotate(' + giro + ' ' + n.x + ' ' + n.y + ')'
      }));
    }
    if (n.valor !== undefined) {
      var frac = el('text', { x: n.x + n.r + 6, y: n.y - n.r - 2, 'class': 'cst-frac' });
      frac.textContent = n.valor;
      deriva.appendChild(frac);
    }
    var lbl = el('text', { x: n.x, y: n.y + n.r + 16, 'class': 'cst-label' });
    lbl.textContent = n.etiqueta;
    deriva.appendChild(lbl);

    g.appendChild(deriva);
    svg.appendChild(g);
    return g;
  }

  function conectar(svg, a, b, clase) {
    svg.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1],
                                 'class': clase || 'cst-arista' }));
  }

  // ── Montaje ──────────────────────────────────────────────────────
  function render(cont, scope, est) {
    var def = figuras(scope, est);
    cont.innerHTML = '';
    var svg = el('svg', { viewBox: def.viewBox, 'class': 'cst-svg',
                          role: 'group', 'aria-label': 'Constelación de navegación GNOSIS' });

    var centro = def.nodos[0];
    esquirlas(svg, centro.x, centro.y, def.esquirlas, scope === 'app' ? 0.6 : 1);

    // la celda unitaria + marcas de corte en los vértices
    var c = def.celda;
    for (var i = 0; i < c.length; i++) {
      conectar(svg, c[i], c[(i + 1) % c.length], 'cst-celda');
      brackets(svg, c[i], i);
    }
    // radios con codo: trazas de circuito del centro a los vértices
    for (var j = 0; j < c.length; j++) trazoAngular(svg, [centro.x, centro.y], c[j], j);

    var subCapa = null;
    def.nodos.forEach(function (n, idx) {
      var g = pintarNodo(svg, n, idx + 1);

      if (n.accion === 'consola') {
        g.addEventListener('click', abrirConsola);
        g.addEventListener('keydown', enterEspacio(abrirConsola));
      }
      if (n.accion === 'tableros') {
        var irTableros = function () {
          if (typeof window.gnosisReveal === 'function') window.gnosisReveal(true);
          else window.location.href = '/';
        };
        g.addEventListener('click', irTableros);
        g.addEventListener('keydown', enterEspacio(irTableros));
      }
      if (n.expandible && n.sub) {
        subCapa = el('g', { 'class': 'cst-subcelda' });
        n.sub.forEach(function (s, k) {
          trazoAngular(subCapa, [n.x, n.y], [s.x, s.y], idx + k + 20);
          pintarNodo(subCapa, s, idx + k + 2);
        });
        svg.appendChild(subCapa);
        var abierta = false;
        var alternar = function (abrir) {
          abierta = abrir;
          subCapa.classList.toggle('abierta', abierta);
          g.setAttribute('aria-expanded', String(abierta));
        };
        g.setAttribute('aria-expanded', 'false');
        g.addEventListener('pointerenter', function () { alternar(true); });
        cont.addEventListener('pointerleave', function () { alternar(false); });
        g.addEventListener('focusin', function () { alternar(true); });
        g.addEventListener('click', function (ev) {
          if (!abierta) { ev.preventDefault(); alternar(true); return; }
          window.location.href = n.href;
        });
        g.addEventListener('keydown', enterEspacio(function () {
          if (!abierta) alternar(true); else window.location.href = n.href;
        }));
      }
    });

    cont.appendChild(svg);

    // leyenda de operaciones (solo celda completa)
    var leyendaSel = cont.getAttribute('data-legend');
    if (scope === 'autogenes' && leyendaSel) {
      var ley = document.querySelector(leyendaSel);
      if (ley && est) {
        ley.innerHTML = '';
        [
          ['I', 'CONCILIA', fmt(est.conciliado_pct, '% conciliado') + ' · ' + fmt(est.faltantes) + ' faltantes'],
          ['II', 'VALIDACIÓN', fmt(est.errores) + ' registros con error'],
          ['III', 'SINAPSIS', fmt(est.relaciones) + ' relaciones · ' + fmt(est.entidades) + ' entidades'],
          ['IV', 'NOMOS', est.reglas == null ? 'latente — fase F12' : fmt(est.reglas) + ' reglas activas']
        ].forEach(function (fila) {
          var li = document.createElement('li');
          li.innerHTML = '<b>' + fila[0] + '</b> ' + fila[1] +
                         ' <span>' + fila[2] + '</span>';
          ley.appendChild(li);
        });
      }
    }
  }

  function abrirConsola() {
    var btn = document.getElementById('gnosis-ia-btn');
    if (btn) btn.click();
  }

  function enterEspacio(fn) {
    return function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fn(); }
    };
  }

  function mount(cont) {
    var scope = cont.getAttribute('data-scope') || 'autogenes';
    render(cont, scope, null); // esqueleto navegable de inmediato
    fetch('/api/v1/autogenes/estado')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (est) { if (est && !est.error) render(cont, scope, est); })
      .catch(function () { /* sin estado: las figuras quedan latentes, nunca rotas */ });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.constelacion[data-scope]').forEach(mount);
  });
})();
