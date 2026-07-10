/* GNOSIS · Constelación cristalográfica — el selector navegable.
   Un componente, dos alcances:
     scope="app"       → celda primitiva (home): AUTOGENES expandible + accesos.
     scope="autogenes" → celda completa (/autogenes): 4 ejes + satélites.
   Gramática P3₂: triángulos = ejes (dashboards), círculos = posiciones
   generales (instrumentos) con su fracción como dato vivo, centro = GNOSIS·IA.
   SVG puro: <a> reales, foco de teclado, hover CSS; deriva por CSS que
   prefers-reduced-motion congela. Ley: toda figura carga métrica real o
   se marca latente — nunca un adorno. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

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
  // metrica: clave(s) del payload /api/v1/autogenes/estado.
  // alerta: la figura se enciende en --danger cuando la condición es real.
  function figuras(scope, est) {
    var E = est || {};
    if (scope === 'app') {
      return {
        viewBox: '0 0 360 300',
        celda: [[52, 268], [252, 268], [308, 96], [108, 96]],
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

    // zona táctil ≥48px (r del hit ≥ 24 unidades a escala típica)
    deriva.appendChild(el('circle', { cx: n.x, cy: n.y, r: Math.max(n.r + 14, 26),
                                      'class': 'cst-hit' }));
    if (n.forma === 'triangulo') {
      deriva.appendChild(el('path', { d: triangulo(n.x, n.y, n.r), 'class': 'cst-forma' }));
    } else if (n.forma === 'centro') {
      deriva.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r, 'class': 'cst-forma' }));
      deriva.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r * 0.45, 'class': 'cst-nucleo' }));
    } else {
      deriva.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r, 'class': 'cst-forma' }));
    }
    // fracción viva (la altura cristalográfica como dato)
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

    // la celda unitaria
    var c = def.celda;
    for (var i = 0; i < c.length; i++) conectar(svg, c[i], c[(i + 1) % c.length], 'cst-celda');
    // radios sutiles del centro a los vértices
    var centro = def.nodos[0];
    for (var j = 0; j < c.length; j++) {
      conectar(svg, [centro.x, centro.y], c[j], 'cst-radio');
    }

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
          conectar(subCapa, [n.x, n.y], [s.x, s.y], 'cst-radio');
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
          // primer toque despliega; el segundo navega al landing AUTOGENES
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
