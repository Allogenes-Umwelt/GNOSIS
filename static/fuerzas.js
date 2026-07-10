/* GNOSIS · Fuerzas — motor de layout de fuerzas mínimo y determinista.
   Sustituto autocontenido de d3-force para los tamaños de un caso por
   sesión (cientos de nodos con LOD): resortes en enlaces, repulsión de
   pares con radio de corte, anillo radial por kind, centrado suave,
   decaimiento de velocidad y de alfa. Sin aleatoriedad: las posiciones
   iniciales salen del seed de cada nodo, así el mismo grafo siempre
   abre igual. API mínima estilo d3: simulacion(...).correr(n) / tick(). */
(function () {
  'use strict';

  function simulacion(nodos, enlaces, opts) {
    opts = opts || {};
    var anillos = opts.anillos || {};           // kind -> radio objetivo
    var fuerzaPorKind = opts.fuerzaPorKind || {};
    var fuerzaAnillo = opts.fuerzaAnillo || 0.08;
    var distancia = opts.distancia || 46;       // largo natural de resorte
    var kResorte = opts.kResorte || 0.06;
    var repulsion = opts.repulsion || 1100;
    var corte = opts.corte || 430;              // radio de corte de repulsión
    var decaiVel = 0.6, alfa = 1, decaiAlfa = opts.decaiAlfa || 0.977;

    // posiciones iniciales deterministas: ángulo áureo por índice DENTRO
    // de cada kind (reparto angular uniforme) + un matiz del seed propio
    var conteoKind = {};
    nodos.forEach(function (n) {
      if (n.x == null) {
        var k = conteoKind[n.kind] = (conteoKind[n.kind] || 0) + 1;
        var ang = k * 2.399963 + (n.seed || 0) * 0.25;
        var r = (anillos[n.kind] != null ? anillos[n.kind] : 300) + (k % 7) * 4;
        n.x = Math.cos(ang) * r;
        n.y = Math.sin(ang) * r;
      }
      n.vx = 0; n.vy = 0;
    });

    var porId = {};
    nodos.forEach(function (n) { porId[n.id] = n; });
    var resortes = [];
    enlaces.forEach(function (e) {
      var a = porId[e.source], b = porId[e.target];
      if (a && b) resortes.push({ a: a, b: b, peso: e.peso || 0.5 });
    });

    function tick() {
      var i, j, n, m, dx, dy, d2, d, f;
      // repulsión de pares (n² con corte — suficiente a esta escala)
      for (i = 0; i < nodos.length; i++) {
        n = nodos[i];
        for (j = i + 1; j < nodos.length; j++) {
          m = nodos[j];
          dx = n.x - m.x; dy = n.y - m.y;
          d2 = dx * dx + dy * dy;
          if (d2 > corte * corte || d2 === 0) continue;
          d = Math.sqrt(d2);
          f = (repulsion * alfa) / d2;
          dx = dx / d * f; dy = dy / d * f;
          n.vx += dx; n.vy += dy; m.vx -= dx; m.vy -= dy;
        }
      }
      // resortes de enlaces
      for (i = 0; i < resortes.length; i++) {
        var r = resortes[i];
        dx = r.b.x - r.a.x; dy = r.b.y - r.a.y;
        d = Math.sqrt(dx * dx + dy * dy) || 1;
        f = (d - distancia) * kResorte * alfa * (0.5 + r.peso * 0.5);
        dx = dx / d * f; dy = dy / d * f;
        r.a.vx += dx; r.a.vy += dy; r.b.vx -= dx; r.b.vy -= dy;
      }
      // anillo por kind + centrado suave
      for (i = 0; i < nodos.length; i++) {
        n = nodos[i];
        var objetivo = anillos[n.kind];
        if (objetivo != null) {
          d = Math.sqrt(n.x * n.x + n.y * n.y) || 1;
          f = (objetivo - d) * (fuerzaPorKind[n.kind] || fuerzaAnillo) * alfa;
          n.vx += n.x / d * f; n.vy += n.y / d * f;
        }
        n.vx -= n.x * 0.006 * alfa; n.vy -= n.y * 0.006 * alfa;
      }
      // integrar (los nodos fijados por arrastre no se mueven solos)
      for (i = 0; i < nodos.length; i++) {
        n = nodos[i];
        if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue; }
        n.vx *= decaiVel; n.vy *= decaiVel;
        n.x += n.vx; n.y += n.vy;
      }
      alfa *= decaiAlfa;
      return alfa;
    }

    return {
      tick: tick,
      correr: function (veces) { for (var k = 0; k < veces; k++) tick(); return this; },
      alfa: function (v) { if (v == null) return alfa; alfa = v; return this; }
    };
  }

  window.Fuerzas = { simulacion: simulacion };
})();
