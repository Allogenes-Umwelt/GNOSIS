/* GNOSIS · Veredicto — la terminal de cabina del home.
   GNOSIS·IA escribe el veredicto de la sesión (teletipo) dentro de un
   readout con bisel recortado y scanlines (ref: cockpit Bebop), montado
   sobre el plano radial de la ciudad-dato (ref: Macross Plus, Studio
   Nue): hairlines que irradian de un núcleo, anillos rotos y clusters.
   Todo determinista — cero aleatoriedad, idéntico en cada carga.
   prefers-reduced-motion: veredicto estático, plano quieto.
   Ley viva: cada frase se compone de /api/v1/autogenes/estado; sin
   estado no hay teatro — se muestra la liturgia estática. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function ruido(i) { return ((i * 2654435761) % 1000) / 1000; }

  // ── El plano radial (Macross): rayos con codo + anillos rotos ────
  function planoRadial(cont) {
    var W = 640, H = 560, cx = 235, cy = 175;   // núcleo asoma arriba-izquierda
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'ver-mapa-svg',
                          'aria-hidden': 'true' });
    // hub secundario (nudo satélite del plano, como en el boceto de Nue)
    for (var h = 0; h < 8; h++) {
      var ha = (h / 8) * 6.283 + 0.4;
      svg.appendChild(el('path', {
        d: 'M' + (500 + Math.cos(ha) * 8) + ',' + (415 + Math.sin(ha) * 8) +
           ' L' + (500 + Math.cos(ha) * (30 + ruido(h + 61) * 42)) + ',' +
           (415 + Math.sin(ha) * (30 + ruido(h + 61) * 42)),
        'class': 'ver-rayo'
      }));
    }
    svg.appendChild(el('circle', { cx: 500, cy: 415, r: 2.6, 'class': 'ver-nucleo' }));
    svg.appendChild(el('circle', { cx: 500, cy: 415, r: 18, 'class': 'ver-anillo' }));
    // rayos del núcleo principal
    for (var i = 0; i < 24; i++) {
      var a = (i / 24) * 6.283 + ruido(i) * 0.3;
      var r0 = 16 + ruido(i + 40) * 10;
      var r1 = 130 + ruido(i + 7) * 130;
      var quiebre = r0 + (r1 - r0) * (0.35 + ruido(i + 21) * 0.3);
      var da = (ruido(i + 55) - 0.5) * 0.34;           // codo tangencial
      var p = 'M' + (cx + Math.cos(a) * r0) + ',' + (cy + Math.sin(a) * r0) +
              ' L' + (cx + Math.cos(a) * quiebre) + ',' + (cy + Math.sin(a) * quiebre) +
              ' L' + (cx + Math.cos(a + da) * r1) + ',' + (cy + Math.sin(a + da) * r1);
      svg.appendChild(el('path', { d: p, 'class': i % 5 === 0 ? 'ver-avenida' : 'ver-rayo' }));
    }
    // anillos rotos
    [58, 104, 168, 232].forEach(function (r, k) {
      var anillo = el('circle', { cx: cx, cy: cy, r: r, 'class': 'ver-anillo' });
      anillo.setAttribute('stroke-dasharray',
        [34 + k * 9, 14, 8, 22, 46, 18].join(' '));
      anillo.setAttribute('transform', 'rotate(' + (ruido(k + 3) * 360).toFixed(0) +
                          ' ' + cx + ' ' + cy + ')');
      svg.appendChild(anillo);
    });
    // clusters urbanos: nodos y manzanas
    for (var j = 0; j < 15; j++) {
      var aa = ruido(j * 3 + 1) * 6.283;
      var rr = 46 + ruido(j * 5 + 2) * 190;
      var x = cx + Math.cos(aa) * rr, y = cy + Math.sin(aa) * rr;
      if (j % 3 === 0) {
        svg.appendChild(el('rect', { x: x - 4, y: y - 3, width: 8, height: 6,
                                     'class': 'ver-manzana' }));
      } else {
        svg.appendChild(el('circle', { cx: x, cy: y, r: 1.6 + ruido(j + 9) * 2.6,
                                       'class': 'ver-nodo' }));
      }
    }
    // el núcleo denso
    svg.appendChild(el('circle', { cx: cx, cy: cy, r: 4, 'class': 'ver-nucleo' }));
    svg.appendChild(el('circle', { cx: cx, cy: cy, r: 11, 'class': 'ver-anillo-nucleo' }));
    cont.appendChild(svg);
  }

  // ── Ornamento de circuito del bezel (Bebop): bloques L anidados ──
  function circuito(cont) {
    var svg = el('svg', { viewBox: '0 0 96 22', 'class': 'ver-circuito', 'aria-hidden': 'true' });
    var d = [
      'M2,18 L2,6 L14,6 L14,12 L8,12 L8,18 Z',
      'M20,4 L38,4 L38,10 L30,10 L30,18 L20,18 Z',
      'M44,8 L58,8 L58,18 L50,18 L50,13 L44,13 Z',
      'M64,4 L72,4 L72,16 L80,16 L80,4 L88,4 L88,18 L64,18 Z'
    ];
    d.forEach(function (path) { svg.appendChild(el('path', { d: path })); });
    cont.appendChild(svg);
  }

  function dinero(v) {
    if (v == null) return '—';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'k';
    return '$' + Math.round(v);
  }

  function frases(E) {
    var f = [];
    if (E.conciliado_pct != null) {
      f.push(E.conciliado_pct + '% de la sesión conciliada contra su papel.');
    }
    if (E.faltantes > 0) f.push(E.faltantes + ' vehículos vendidos aún sin factura física.');
    if (E.errores > 0) f.push(E.errores + ' documentos ilegibles esperan curación.');
    if (E.valor_total > 0) f.push(dinero(E.valor_total) + ' verificados en un solo expediente.');
    if (f.length === 0) f.push('Sesión conciliada. Sin pendientes.');
    return f;
  }

  function mount(term) {
    var mapa = document.querySelector(term.getAttribute('data-mapa') || '#ver-mapa');
    if (mapa) planoRadial(mapa);
    var orn = term.querySelector('.ver-circuito-slot');
    if (orn) circuito(orn);

    var tty = term.querySelector('.ver-tty');
    if (!tty) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    fetch('/api/v1/autogenes/estado')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (E) {
        if (!E || E.error) {
          tty.textContent = 'Una sola fuente de la verdad.';
          return;
        }
        var lista = frases(E);
        if (reduce) { tty.textContent = lista[0]; return; }
        var fIdx = 0, i = 0;
        (function tic() {
          var t = lista[fIdx];
          tty.innerHTML = t.slice(0, i) + '<span class="ver-cursor">▮</span>';
          if (i++ <= t.length) return setTimeout(tic, 30);
          setTimeout(function () { i = 0; fIdx = (fIdx + 1) % lista.length; tic(); }, 3200);
        })();
      })
      .catch(function () { tty.textContent = 'Una sola fuente de la verdad.'; });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.ver-terminal').forEach(mount);
  });
})();
