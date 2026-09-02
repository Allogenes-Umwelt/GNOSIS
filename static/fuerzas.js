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

    // Sectores por comunidad (PANOPTES §4.2): cada comunidad ocupa un arco
    // proporcional a su tamaño (orden estable por índice), y sus nodos reciben
    // un empuje tangencial hacia el centro de su arco. Así los racimos se
    // separan sin romper los anillos por kind — la nube pasa a rosa. Solo se
    // activa si los nodos traen `comunidad` (payload PANOPTES); sin ella, el
    // motor se comporta igual que antes.
    var fuerzaSector = opts.fuerzaSector || 0.03;
    var anguloCom = {}, tieneSectores = false;
    (function () {
      var conteo = {}, total = 0;
      nodos.forEach(function (n) {
        if (n.comunidad != null) { conteo[n.comunidad] = (conteo[n.comunidad] || 0) + 1; total++; }
      });
      if (!total) return;
      tieneSectores = true;
      var claves = Object.keys(conteo).sort(function (a, b) { return a - b; });
      var acc = 0;
      claves.forEach(function (c) {
        var frac = conteo[c] / total;
        anguloCom[c] = (acc + frac / 2) * 2 * Math.PI;   // ángulo central del arco
        acc += frac;
      });
    })();

    var corte2 = corte * corte;

    function tick() {
      var i, j, n, m, dx, dy, d2, d, f;
      // repulsión por rejilla espacial (PANOPTES §4.3): celda = radio de
      // corte, así solo se comparan pares dentro de la misma celda y las 8
      // vecinas — O(n·k) en vez de O(n²), MISMAS fuerzas (los pares más
      // lejanos que el corte ya se descartaban). Determinista: el orden de
      // iteración es el índice de nodo, no el hash.
      var rejilla = {};
      for (i = 0; i < nodos.length; i++) {
        n = nodos[i];
        var clave = Math.floor(n.x / corte) + ',' + Math.floor(n.y / corte);
        (rejilla[clave] = rejilla[clave] || []).push(i);
      }
      for (i = 0; i < nodos.length; i++) {
        n = nodos[i];
        var cx = Math.floor(n.x / corte), cy = Math.floor(n.y / corte);
        for (var gx = cx - 1; gx <= cx + 1; gx++) {
          for (var gy = cy - 1; gy <= cy + 1; gy++) {
            var celda = rejilla[gx + ',' + gy];
            if (!celda) continue;
            for (var ci = 0; ci < celda.length; ci++) {
              j = celda[ci];
              if (j <= i) continue;            // cada par una sola vez
              m = nodos[j];
              dx = n.x - m.x; dy = n.y - m.y;
              d2 = dx * dx + dy * dy;
              if (d2 === 0) {
                // nodos coincidentes: sin esto la repulsión (÷d2) y el resorte
                // (÷d) dan vector cero y quedan fundidos para siempre. Empuje
                // mínimo DETERMINISTA por índice de par (jamás azar: el layout
                // debe abrir idéntico) para romper la degeneración.
                var ang = (i * 2 + j) * 0.7, e0 = repulsion * alfa * 1e-3;
                n.vx += Math.cos(ang) * e0; n.vy += Math.sin(ang) * e0;
                m.vx -= Math.cos(ang) * e0; m.vy -= Math.sin(ang) * e0;
                continue;
              }
              if (d2 > corte2) continue;
              d = Math.sqrt(d2);
              f = (repulsion * alfa) / d2;
              dx = dx / d * f; dy = dy / d * f;
              n.vx += dx; n.vy += dy; m.vx -= dx; m.vy -= dy;
            }
          }
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
      // anillo por kind + sector por comunidad + centrado suave
      for (i = 0; i < nodos.length; i++) {
        n = nodos[i];
        if (n.fx != null) continue;   // los fijados (núcleo, arrastre) no rotan
        var objetivo = anillos[n.kind];
        d = Math.sqrt(n.x * n.x + n.y * n.y) || 1;
        if (objetivo != null) {
          f = (objetivo - d) * (fuerzaPorKind[n.kind] || fuerzaAnillo) * alfa;
          n.vx += n.x / d * f; n.vy += n.y / d * f;
        }
        if (tieneSectores && n.comunidad != null) {
          // empuje tangencial hacia el ángulo del sector (envuelto a [-π,π])
          var dif = anguloCom[n.comunidad] - Math.atan2(n.y, n.x);
          while (dif > Math.PI) dif -= 2 * Math.PI;
          while (dif < -Math.PI) dif += 2 * Math.PI;
          // escala con d: la velocidad angular es uniforme a cualquier anillo
          var ft = dif * fuerzaSector * alfa * d;
          n.vx += (-n.y / d) * ft; n.vy += (n.x / d) * ft;
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
