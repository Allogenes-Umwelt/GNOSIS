/* GNOSIS · Grafo — el lienzo de fuerzas del caso (port del GrafoCanvas
   de KARELEN sobre el motor propio Fuerzas). Canvas 2D, anillos
   concéntricos por kind (nucleo → pedimento → marca/pais → vehiculo →
   artefacto → fragmento → entidad), trazo Z.O.E. (citas punteadas,
   relaciones con peso, brackets de esquina, anillo giratorio en la
   selección). Gestos: arrastrar nodo, pan, rueda y pinch para zoom,
   tap para inspeccionar (vecinos resaltados, resto atenuado).
   prefers-reduced-motion: el layout se asienta síncrono y queda quieto.
   Datos: /api/v1/autogenes/grafo — nunca inventados. */
(function () {
  'use strict';

  var ANILLOS = { nucleo: 0, producto: 100, pedimento: 175, marca: 265, pais: 265,
                  vehiculo: 360, artefacto: 480, fragmento: 550, entidad: 620 };
  var FUERZA_ANILLO = { nucleo: 0.5, producto: 0.28, pedimento: 0.3, marca: 0.3,
                        pais: 0.3, vehiculo: 0.12, artefacto: 0.14, fragmento: 0.1,
                        entidad: 0.14 };

  function radioDe(n) {
    // meta-nodo de vehículos (ν×N): radio ∝ √N, el racimo se ve por su masa
    if (n.meta) return 9 + Math.min(15, Math.sqrt(n.conteo || 1) * 2);
    var base = { nucleo: 14, pedimento: 8, marca: 9, pais: 8, vehiculo: 3.2,
                 artefacto: 6.5, fragmento: 2.2, entidad: 6.5, producto: 7.5,
                 anomalia: 8.5 }[n.kind] || 4;
    // la centralidad de vector propio modula el tamaño: lo que conecta con
    // lo bien conectado pesa más (PANOPTES §4.2), no solo el grado bruto
    return base + Math.min(5, Math.sqrt(n.grado || 0) * 0.8) + (n.centralidad || 0) * 3;
  }

  // Tiers de render (PANOPTES §5): HUB = ojo-sensor (anillos maquinados +
  // núcleo incandescente); MEDIO = anillo simple + glifo; HOJA = forma
  // mínima. Los kinds estructurales son HUB; un nodo-hoja con centralidad
  // alta sube a MEDIO para que no se pierda.
  var TIER_HUB = { nucleo: 1, marca: 1, pedimento: 1, pais: 1, producto: 1 };
  var TIER_HOJA = { vehiculo: 1, fragmento: 1 };
  function tierDe(n) {
    if (n.meta) return 'medio';   // el racimo ν×N es prominente
    if (TIER_HUB[n.kind]) return 'hub';
    if (TIER_HOJA[n.kind]) return (n.centralidad || 0) >= 0.6 ? 'medio' : 'hoja';
    return 'medio';   // artefacto (Σ), entidad (Ψ/Ω/ε), anomalia (Δ)
  }

  function q(sel) { return sel ? document.querySelector(sel) : null; }

  // Las etiquetas de entidad vienen de extracción sobre documentos: se
  // escapan SIEMPRE antes de entrar al DOM.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function montar(cont) {
    var canvas = cont.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var inspector = q(cont.getAttribute('data-inspector'));
    var estadoLinea = q(cont.getAttribute('data-estado'));
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    var nodos = [], enlaces = [], porId = {}, vecinos = {};
    var nodosRaw = [], enlacesRaw = [], porIdRaw = {};   // payload completo; el colapso decide qué se dibuja
    var badgeFrag = {};                   // artefacto id -> nº de fragmentos colapsados
    var mostrarFragmentos = false;        // σ colapsados por defecto (mata el hairball)
    var expandidos = {};                  // pedimento ids con su racimo de vehículos abierto
    var UMBRAL_COLAPSO = 24;              // racimo de vehículos que se colapsa en meta-nodo
    var sesionId = null;
    var sim = null, animando = false, latiendo = false, t0 = 0;
    var vista = { x: 0, y: 0, k: 1 };
    var sel = null, hover = null;
    var resalte = null;          // {nodos:{}, enlaces:{}} — camino/vecindario
    var whatif = null;           // {id, r} — simulación de caída (P3, DECIDIR)
    var estadoPendiente = null;  // estado del deep-link a aplicar tras la 1ª carga (L1)
    var primeraCarga = true;
    var tarjetas = [], capaTarjetas = null;   // callouts anclados (PANOPTES §6)
    var modoCamino = null;       // {desde} — esperando el nodo destino del camino
    var kindsAtenuados = {};     // clases atenuadas por la leyenda (filtro)
    var kindAislado = null;      // clase aislada (duotono §7.2); null = ninguna
    function leyOculta(k) { return kindAislado ? k !== kindAislado : !!kindsAtenuados[k]; }
    var despliegue = null;       // funnel: {centro, orbita:[{n,tx,ty,x0,y0}], t}
    var particulas = [];         // sinapsis: {a,b,p,sp,color} sobre cables activos
    var vistaManual = false;     // pan/zoom del operador: el auto-encuadre no la pisa
    var colores = {};
    var esLight = false;         // tema activo — decide glow (dark) vs burn (light)

    // Ley de marca: el canvas es "gráfico fino" — usa la variante AAA
    // por modo (--acc-text), nunca el cyan real fijo.
    function conAlfa(hex, a) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
             ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    function leerColores() {
      var cs = getComputedStyle(document.documentElement);
      colores = {
        acc: cs.getPropertyValue('--acc-text').trim() || '#00D4FF',
        cobalt: cs.getPropertyValue('--cobalt-on').trim() || '#8C9EFF',
        warn: cs.getPropertyValue('--warn').trim() || '#FF80AA',
        danger: cs.getPropertyValue('--danger').trim() || '#F57F9C',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        linea2: cs.getPropertyValue('--line-2').trim() || '#777',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA',
        bg: cs.getPropertyValue('--bg').trim() || '#050505',
        fondo: 'transparent'
      };
      esLight = document.documentElement.getAttribute('data-theme') === 'light';
    }

    // ── paleta y formas por nodo (PANOPTES §1.1, §5) ──────────────────
    // color de identidad del nodo (trazo del ojo-sensor y glifo)
    function colorNodo(n) {
      if (n.kind === 'anomalia') {
        return n.severidad === 'danger' ? colores.danger : colores.warn;
      }
      if (n.kind === 'pais') return colores.cobalt;
      if (n.kind === 'artefacto' || n.kind === 'entidad') return colores.acc;
      if (n.kind === 'vehiculo' || n.kind === 'fragmento') return colores.linea2;
      if (n.kind === 'pedimento') return colores.acc;   // dardo Anubis (mock v2)
      return colores.t1;   // nucleo, marca, producto (Frame)
    }
    // color del núcleo incandescente: cian salvo país (cobalt) y Δ (severidad)
    function nucleoDe(n) {
      if (n.kind === 'anomalia') {
        return n.severidad === 'danger' ? colores.danger : colores.warn;
      }
      if (n.kind === 'pais') return colores.cobalt;
      return colores.acc;
    }
    // ── hojas fin-funnel (GRAFO II · mock v2 aprobado: α-1 corona + P-2 dardo) ──
    // Silueta cuchillo 1:8 con muesca de filo (ν Gundam) y variante asimétrica
    // con hombro escalonado doble (Anubis). x = fracción del semiancho,
    // y = fracción del largo (−0.5 punta … +0.5 cola); se espeja en x.
    var DARDO_PTS = [[0, -0.50], [0.40, -0.26], [0.40, -0.16], [1.0, 0.00],
                     [0.80, 0.08], [1.0, 0.12], [0.78, 0.36], [0.92, 0.50],
                     [0.32, 0.40], [0, 0.46]];
    var DARDO_SK = 0.14;   // cizalla del barrido asimétrico
    // agrega el path de la hoja al path actual, en coords ya trasladadas/rotadas
    function trazarHoja(L, sk) {
      var w = L * 0.065;   // semiancho (hoja 1:8)
      function P(px, py) { return [px * w + py * L * sk, py * L]; }
      var q = P(DARDO_PTS[0][0], DARDO_PTS[0][1]);
      ctx.moveTo(q[0], q[1]);
      for (var i = 1; i < DARDO_PTS.length; i++) {
        q = P(DARDO_PTS[i][0], DARDO_PTS[i][1]); ctx.lineTo(q[0], q[1]);
      }
      for (var j = DARDO_PTS.length - 2; j >= 1; j--) {
        q = P(-DARDO_PTS[j][0], DARDO_PTS[j][1]); ctx.lineTo(q[0], q[1]);
      }
      ctx.closePath();
    }
    // orientación del dardo: la punta apunta ALEJÁNDOSE de su ancla (el
    // nucleo o el vecino más pesado) — el funnel vuela hacia afuera del mando
    function anguloDardo(n) {
      var ids = Object.keys(vecinos[n.id] || {}), ancla = null, mejor = -1;
      for (var i = 0; i < ids.length; i++) {
        var v = porId[ids[i]]; if (!v) continue;
        var peso = v.kind === 'nucleo' ? 1e6 : radioDe(v);
        if (peso > mejor) { mejor = peso; ancla = v; }
      }
      if (!ancla) return 0;
      return Math.atan2(n.y - ancla.y, n.x - ancla.x) + Math.PI / 2;
    }
    function largoDardo(r) { return r * 3.1; }
    // pedimento = dardo Anubis orientado, con ranura incandescente; el
    // detalle mecha (doble trazo, panel lines, verniers) solo con zoom (LOD)
    function dibujarDardo(n, r, col, esFoco, detalle) {
      var L = largoDardo(r), ang = anguloDardo(n);
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(ang);
      ctx.beginPath(); trazarHoja(L, DARDO_SK);
      ctx.fillStyle = esLight ? 'rgba(250,250,248,.94)' : 'rgba(9,14,20,.96)';
      ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = esFoco ? 2.0 : Math.max(1, L * 0.014);
      ctx.stroke();
      if (detalle) {
        ctx.save(); ctx.beginPath(); trazarHoja(L, DARDO_SK); ctx.clip();
        ctx.beginPath(); trazarHoja(L * 0.90, DARDO_SK);      // doble trazo
        ctx.strokeStyle = conAlfa(col, 0.4); ctx.lineWidth = 0.7; ctx.stroke();
        ctx.strokeStyle = conAlfa(col, 0.30); ctx.lineWidth = 0.6;   // panel lines
        var cortes = [[-0.13, 0.55], [0.10, 0.8], [0.24, 0.7]];
        for (var c = 0; c < cortes.length; c++) {
          var yy = cortes[c][0] * L, half = L * 0.065 * cortes[c][1];
          ctx.beginPath(); ctx.moveTo(-half + DARDO_SK * yy, yy);
          ctx.lineTo(half * 0.2 + DARDO_SK * yy, yy + L * 0.03);
          ctx.lineTo(half + DARDO_SK * yy, yy); ctx.stroke();
        }
        ctx.fillStyle = conAlfa(col, 0.75);                   // verniers gemelos
        var vs = [[-0.22, 0.40], [0.22, 0.40]];
        for (var k = 0; k < vs.length; k++) {
          var vx = vs[k][0] * L * 0.065 + DARDO_SK * vs[k][1] * L, vy = vs[k][1] * L;
          ctx.fillRect(vx - L * 0.007, vy, L * 0.014, L * 0.05);
        }
        ctx.restore();
      }
      // ranura incandescente — la ÚNICA fuente de glow del dardo
      var g = ctx.createLinearGradient(0, -L * 0.30, 0, L * 0.16);
      g.addColorStop(0, conAlfa(colores.acc, 0));
      g.addColorStop(0.45, conAlfa(colores.acc, 0.95));
      g.addColorStop(1, conAlfa(colores.acc, 0));
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.6, L * 0.012);
      ctx.shadowColor = colores.acc; ctx.shadowBlur = L * 0.10;
      ctx.beginPath(); ctx.moveTo(DARDO_SK * -L * 0.12, -L * 0.30);
      ctx.lineTo(DARDO_SK * L * 0.16, L * 0.16); ctx.stroke();
      ctx.shadowBlur = 0; ctx.restore();
    }
    // α = corona: dial con ticks de instrumento (hereda la respiración del
    // halo) + núcleo contenido (disco + anillo, no bola difusa) + 3 cuchillos
    // desplegados puntas afuera girando lentísimo (estático bajo reduced-motion)
    function dibujarCorona(n, r, ts, esFoco, detalle) {
      var S = r * 1.85;
      ctx.save(); ctx.translate(n.x, n.y);
      var aDial = (reduce || !latiendo) ? 0.35 : 0.22 + 0.26 * fase(3500, ts);
      ctx.globalAlpha = aDial; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, S * 0.60, 0, 6.283); ctx.stroke();
      for (var i = 0; i < 12; i++) {
        var a = i * 0.5236, tk = (i % 3 === 0) ? S * 0.055 : S * 0.028;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (S * 0.60 - tk), Math.sin(a) * (S * 0.60 - tk));
        ctx.lineTo(Math.cos(a) * (S * 0.60 + tk), Math.sin(a) * (S * 0.60 + tk));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colores.t1; ctx.lineWidth = esFoco ? 2.0 : 1.2;
      ctx.beginPath(); ctx.arc(0, 0, S * 0.16, 0, 6.283); ctx.stroke();
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.13);
      g.addColorStop(0, conAlfa(colores.t1, 0.9));
      g.addColorStop(0.5, conAlfa(colores.acc, 0.65));
      g.addColorStop(1, conAlfa(colores.acc, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, S * 0.13, 0, 6.283); ctx.fill();
      var giro = (reduce || !latiendo) ? 0 : ((ts || 0) / 52000) * 6.283;
      for (var b = 0; b < 3; b++) {
        var ab = -Math.PI / 2 + b * 2.094 + giro;
        ctx.save();
        ctx.translate(Math.cos(ab) * S * 0.86, Math.sin(ab) * S * 0.86);
        ctx.rotate(ab + Math.PI / 2);
        var L = S * 0.88;
        ctx.beginPath(); trazarHoja(L, 0);
        ctx.fillStyle = esLight ? 'rgba(250,250,248,.94)' : 'rgba(9,14,20,.96)';
        ctx.fill();
        ctx.strokeStyle = colores.acc; ctx.lineWidth = Math.max(1, L * 0.016);
        ctx.stroke();
        if (detalle) {
          ctx.beginPath(); trazarHoja(L * 0.90, 0);
          ctx.strokeStyle = conAlfa(colores.acc, 0.4); ctx.lineWidth = 0.7; ctx.stroke();
        }
        var gs = ctx.createLinearGradient(0, -L * 0.30, 0, L * 0.16);
        gs.addColorStop(0, conAlfa(colores.acc, 0));
        gs.addColorStop(0.45, conAlfa(colores.acc, 0.95));
        gs.addColorStop(1, conAlfa(colores.acc, 0));
        ctx.strokeStyle = gs; ctx.lineWidth = Math.max(0.6, L * 0.012);
        ctx.shadowColor = colores.acc; ctx.shadowBlur = L * 0.10;
        ctx.beginPath(); ctx.moveTo(0, -L * 0.30); ctx.lineTo(0, L * 0.16); ctx.stroke();
        ctx.shadowBlur = 0; ctx.restore();
      }
      ctx.restore();
    }

    function trazarForma(n, r) {
      ctx.beginPath();
      if (n.kind === 'artefacto' || n.kind === 'fragmento') {
        ctx.rect(n.x - r, n.y - r, r * 2, r * 2);            // Frame: documental
      } else if (n.kind === 'pedimento') {
        // silueta del dardo (para modo tenue/apagado), misma orientación
        ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(anguloDardo(n));
        trazarHoja(largoDardo(r), DARDO_SK); ctx.restore();
      } else if (n.kind === 'anomalia') {                    // Δ: triángulo de alerta
        ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r * 0.92, n.y + r * 0.72);
        ctx.lineTo(n.x - r * 0.92, n.y + r * 0.72); ctx.closePath();
      } else {
        ctx.arc(n.x, n.y, r, 0, 6.283);
      }
    }
    function nucleoIncandescente(n, r, color) {
      var rc = r * 0.6;
      var grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rc);
      grad.addColorStop(0, conAlfa(color, 0.85));
      grad.addColorStop(1, conAlfa(color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(n.x, n.y, rc, 0, 6.283); ctx.fill();
    }

    // fase 0..1 de un ciclo respiratorio de `periodo` ms (coseno suave)
    function fase(periodo, ts) {
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * ((ts || 0) % periodo) / periodo);
    }

    // GLOW⇄BURN (S1S1R1 §3.1 / PANOPTES §5.4): la MISMA alerta de riesgo,
    // dos render por tema. Solo Δ con severidad. En Nocturne un halo
    // relleno que respira; en Daylight un anillo de trazo que titila.
    // reduced-motion: anillo estático a plena presencia (la info no se pierde).
    function glowBurn(n, r, ts) {
      var color = n.severidad === 'danger' ? colores.danger : colores.warn;
      var periodo = n.severidad === 'danger' ? 1600 : 2400;   // crít 1.6s / alto 2.4s
      var f = reduce ? 0.5 : fase(periodo, ts);               // estático a media presencia
      ctx.save();
      if (esLight) {
        // BURN: anillo de trazo que titila (Daylight)
        var rr = r + 12;
        ctx.globalAlpha = reduce ? 0.9 : 0.15 + 0.8 * f;
        ctx.strokeStyle = color; ctx.lineWidth = n.severidad === 'danger' ? 2.4 : 3.0;
        ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 6.283); ctx.stroke();
      } else {
        // GLOW: halo RADIAL que respira (Nocturne). Gradiente suave —
        // el centro no satura y el borde se desvanece a transparente, en
        // vez del disco de relleno plano que quemaba el color.
        var rg = r + 16;
        var a = 0.5 + 0.5 * f;
        var g = ctx.createRadialGradient(n.x, n.y, r * 0.5, n.x, n.y, rg);
        g.addColorStop(0, conAlfa(color, 0.30 * a));
        g.addColorStop(0.55, conAlfa(color, 0.13 * a));
        g.addColorStop(1, conAlfa(color, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(n.x, n.y, rg, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    }

    // Afterburn de selección (S1S1R1 §3.5 / las barras verticales del AC):
    // barras de luz bajo el nodo, gradiente que se desvanece. Estático bajo
    // reduced-motion; con motion, shimmer suave (ciclo ≥ 2s, nunca > 5 Hz).
    function afterburn(n, r, ts) {
      var barras = 3, sep = 3.4, largo = r * 1.7;
      var shimmer = reduce ? 1 : 0.7 + 0.3 * fase(2200, ts);
      ctx.save(); ctx.lineWidth = 1.4;
      for (var i = 0; i < barras; i++) {
        var bx = n.x + (i - (barras - 1) / 2) * sep;
        var y0 = n.y + r + 2, y1 = y0 + largo;
        var grad = ctx.createLinearGradient(bx, y0, bx, y1);
        grad.addColorStop(0, conAlfa(colores.acc, 0.5 * shimmer));
        grad.addColorStop(1, conAlfa(colores.acc, 0));
        ctx.strokeStyle = grad;
        ctx.beginPath(); ctx.moveTo(bx, y0); ctx.lineTo(bx, y1); ctx.stroke();
      }
      ctx.restore();
    }

    var dpr = 1;
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(caja.width * dpr);
      canvas.height = Math.round(Math.max(420, caja.height) * dpr);
      canvas.style.width = caja.width + 'px';
      canvas.style.height = Math.max(420, caja.height) + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    var reqSeq = 0;   // token de secuencia: una respuesta vieja nunca pisa a la nueva
    function cargar(limite) {
      var url = '/api/v1/autogenes/grafo' + (limite ? '?limite_vehiculos=' + limite : '');
      var mia = ++reqSeq;
      if (estadoLinea) estadoLinea.textContent = 'CARGANDO EL CASO…';
      fetch(url).then(function (r) { return r.json(); }).then(function (g) {
        if (mia !== reqSeq) return;
        if (!g || g.error) {
          if (estadoLinea) estadoLinea.textContent = g && g.error ? g.error.toUpperCase() : 'SIN DATOS';
          return;
        }
        nodosRaw = g.nodos; enlacesRaw = g.enlaces; sesionId = g.session_id;
        // badges: nº de fragmentos que cuelgan de cada artefacto (Σ)
        badgeFrag = {};
        porIdRaw = {};
        nodosRaw.forEach(function (n) { porIdRaw[n.id] = n; });
        enlacesRaw.forEach(function (e) {
          var s = porIdRaw[e.source], t = porIdRaw[e.target];
          if (s && t && s.kind === 'fragmento' && t.kind === 'artefacto') {
            badgeFrag[t.id] = (badgeFrag[t.id] || 0) + 1;
          }
        });
        sel = null; pintarInspector(null);
        colapsar();          // deriva nodos/enlaces visibles + estado
        reconstruirSim();
        cont.dispatchEvent(new CustomEvent('grafo:listo', { detail: { nodos: nodos } }));
        if (primeraCarga) { primeraCarga = false; aplicarEstadoPendiente(); }
      }).catch(function () {
        if (mia !== reqSeq) return;
        if (estadoLinea) estadoLinea.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
      });
    }

    // Colapso (PANOPTES §4): del payload completo deriva el set VISIBLE. Dos
    // capas: (1) los fragmentos σ se ocultan por defecto tras el badge ×N de
    // cada Σ; (2) los racimos de vehículos que cuelgan de un pedimento con más
    // de UMBRAL unidades se pliegan en UN meta-nodo ν×N — tocar lo despliega.
    // Las aristas de lo colapsado se remapean a su meta (nada pierde conexión)
    // y se deduplican. porId/vecinos se reconstruyen sobre lo visible.
    function colapsar() {
      var oculto = {};
      if (!mostrarFragmentos) {
        nodosRaw.forEach(function (n) { if (n.kind === 'fragmento') oculto[n.id] = true; });
      }

      // racimos: vehículos por pedimento (desde las citas ped -> veh)
      var padre = {}, racimo = {};
      enlacesRaw.forEach(function (e) {
        var s = porIdRaw[e.source], t = porIdRaw[e.target];
        if (s && t && s.kind === 'pedimento' && t.kind === 'vehiculo') padre[t.id] = s.id;
      });
      nodosRaw.forEach(function (n) {
        if (n.kind === 'vehiculo' && padre[n.id]) {
          (racimo[padre[n.id]] = racimo[padre[n.id]] || []).push(n.id);
        }
      });

      // meta-nodos ν×N para racimos grandes; los expandidos muestran las hojas
      var metaDe = {}, metaNodos = [];
      Object.keys(racimo).forEach(function (pedId) {
        var vehs = racimo[pedId];
        if (vehs.length <= UMBRAL_COLAPSO) return;
        var metaId = 'metaveh:' + pedId, ped = porIdRaw[pedId];
        var abierto = !!expandidos[pedId];
        vehs.forEach(function (vid, idx) {
          metaDe[vid] = metaId;
          if (!abierto) { oculto[vid] = true; return; }   // colapsado: no se dibuja
          // abierto: la hoja brota del pedimento en abanico si aún no tiene sitio
          var v = porIdRaw[vid];
          if (v && v.x == null && ped && ped.x != null) {
            var a = (v.seed || 0) + idx * 0.7;
            v.x = ped.x + Math.cos(a) * 30; v.y = ped.y + Math.sin(a) * 30;
          }
        });
        // agrega precio/tipo de los miembros para el dossier del racimo
        var mVal = 0, mMin = Infinity, mMax = -Infinity, mTipos = {};
        vehs.forEach(function (vid) {
          var v = porIdRaw[vid]; if (!v) return;
          var pr = v.extra ? +v.extra.precio : 0;
          if (pr) { mVal += pr; if (pr < mMin) mMin = pr; if (pr > mMax) mMax = pr; }
          if (v.tipo) mTipos[v.tipo] = (mTipos[v.tipo] || 0) + 1;
        });
        var mTipo = Object.keys(mTipos).sort(function (a, b) { return mTipos[b] - mTipos[a]; })[0] || null;
        metaNodos.push({
          id: metaId, kind: 'vehiculo', meta: true, abierto: abierto,
          conteo: vehs.length, glifo: 'ν', etiqueta: vehs.length + ' vehículos',
          ped: pedId, comunidad: ped ? ped.comunidad : 0, centralidad: 0.35,
          seed: (ped ? ped.seed : 0) || 0,
          x: ped ? ped.x : undefined, y: ped ? ped.y : undefined,
          extra: { valor: mVal || null, precio_min: isFinite(mMin) ? mMin : null,
                   precio_max: isFinite(mMax) ? mMax : null, tipo: mTipo }
        });
      });

      nodos = nodosRaw.filter(function (n) { return !oculto[n.id]; }).concat(metaNodos);

      // aristas: remapea colapsados a su meta, ancla el pedimento al meta,
      // salta ocultos sin meta (fragmentos) y deduplica
      var visto = {};
      enlaces = [];
      enlacesRaw.forEach(function (e) {
        if (oculto[e.source] && !metaDe[e.source]) return;   // fragmento oculto
        if (oculto[e.target] && !metaDe[e.target]) return;
        var s = e.source, t = e.target;
        if (oculto[e.source] && metaDe[e.source]) s = metaDe[e.source];
        if (oculto[e.target] && metaDe[e.target]) t = metaDe[e.target];
        // el pedimento ancla al meta (aunque el racimo esté abierto)
        var sN = porIdRaw[e.source];
        if (sN && sN.kind === 'pedimento' && metaDe[e.target]) t = metaDe[e.target];
        if (s === t) return;
        var k = s + '|' + t + '|' + e.kind;
        if (visto[k]) return;
        visto[k] = true;
        enlaces.push({ id: e.id, source: s, target: t, kind: e.kind,
                       peso: e.peso, tipo: e.tipo });
      });
      // fan-out: el meta cita cada hoja visible de un racimo abierto
      Object.keys(metaDe).forEach(function (vid) {
        if (oculto[vid]) return;   // hoja colapsada, ya representada por el meta
        var k = metaDe[vid] + '|' + vid + '|cita';
        if (visto[k]) return;
        visto[k] = true;
        enlaces.push({ id: 'fan-' + vid, source: metaDe[vid], target: vid,
                       kind: 'cita', peso: 0.5 });
      });

      porId = {}; vecinos = {};
      nodos.forEach(function (n) { porId[n.id] = n; });
      enlaces.forEach(function (e) {
        (vecinos[e.source] = vecinos[e.source] || {})[e.target] = true;
        (vecinos[e.target] = vecinos[e.target] || {})[e.source] = true;
      });
      // cierra tarjetas cuyo nodo dejó de ser visible (p.ej. hoja plegada)
      if (capaTarjetas && tarjetas.length) {
        tarjetas = tarjetas.filter(function (t) {
          if (porId[t.nodo.id]) return true;
          capaTarjetas.removeChild(t.el); return false;
        });
      }
      if (estadoLinea) {
        var nMeta = metaNodos.filter(function (m) { return !m.abierto; }).length;
        estadoLinea.textContent = nodos.length + ' NODOS · ' + enlaces.length +
          ' ENLACES · SESIÓN ' + (sesionId || '—') +
          (mostrarFragmentos ? '' : ' · σ OCULTOS') +
          (nMeta ? ' · ' + nMeta + ' RACIMO' + (nMeta > 1 ? 'S' : '') : '');
      }
      if (typeof pintarLeyenda === 'function') pintarLeyenda();
      if (typeof pintarDatalist === 'function') pintarDatalist();
    }

    // Reconstruye la simulación sobre el set visible. Los nodos conservan su
    // x/y previo (mismo objeto), así un toggle re-asienta en vez de saltar;
    // los nuevos arrancan de su seed (determinista).
    function reconstruirSim() {
      var nucleo = nodos.find(function (n) { return n.kind === 'nucleo'; });
      if (nucleo) { nucleo.x = 0; nucleo.y = 0; nucleo.fx = 0; nucleo.fy = 0; }
      sim = Fuerzas.simulacion(nodos, enlaces,
                               { anillos: ANILLOS, fuerzaPorKind: FUERZA_ANILLO });
      if (reduce) { sim.correr(300); encuadrar(); dibujar(0); }
      else { sim.correr(60); encuadrar(); animar(); }
    }

    function animar() {
      if (animando) return;
      animando = true;
      (function paso(ts) {
        var alfa = sim ? sim.tick() : 0;
        pasoDespliegue(); pasoParticulas();
        dibujar(ts);
        if (alfa > 0.004 || arrastre.nodo) requestAnimationFrame(paso);
        else { animando = false; if (!vistaManual) encuadrar(); dibujar(ts); arrancarLatido(); }
      })(0);
    }

    // Latido: reloj de render puro (sin tick de simulación) para los efectos
    // vivos — glow/burn de las Δ y afterburn de la selección. Solo corre si
    // hay algo que animar y NO bajo reduced-motion; cede el paso a la
    // simulación cuando ésta retoma. Mantiene el lienzo en reposo cuando no
    // hay alertas ni selección (sin rAF ocioso).
    function vivoAnimado() {
      if (reduce) return false;
      if (sel || despliegue) return true;
      for (var i = 0; i < nodos.length; i++) {
        if (nodos[i].kind === 'anomalia' && nodos[i].severidad) return true;
      }
      return false;
    }
    function arrancarLatido() {
      if (latiendo || animando || !vivoAnimado()) return;
      latiendo = true;
      requestAnimationFrame(function pulso(ts) {
        if (animando || !vivoAnimado()) { latiendo = false; return; }
        pasoDespliegue(); pasoParticulas();
        dibujar(ts);
        requestAnimationFrame(pulso);
      });
    }

    // ── Funnel newtype (PANOPTES §7.1) ────────────────────────────────
    // Al seleccionar, los top-K vecinos por peso de arista se despliegan a
    // un anillo orbital alrededor del nodo (posiciones angulares estables por
    // id); el resto recede (el apagado del foco). Las aristas activas son
    // cables-estela con caída; por ellas viajan partículas sinápticas (solo
    // Nocturne). Esc / nueva selección repliega. Reduced-motion: directo.
    function desplegarFunnel(centro) {
      replegarFunnel();
      var pesos = {};
      enlaces.forEach(function (e) {
        if (e.source === centro.id) pesos[e.target] = Math.max(pesos[e.target] || 0, e.peso || 0.5);
        else if (e.target === centro.id) pesos[e.source] = Math.max(pesos[e.source] || 0, e.peso || 0.5);
      });
      var ids = Object.keys(vecinos[centro.id] || {})
        .sort(function (a, b) { return (pesos[b] || 0) - (pesos[a] || 0); }).slice(0, 8);
      if (!ids.length) return;
      var R = radioDe(centro) + 90, K = ids.length;
      var orbita = [];
      ids.forEach(function (id, i) {
        var n = porId[id];
        if (!n || n.fx != null) return;   // no roba un nodo ya fijado (arrastre)
        var ang = (n.seed || 0) * 0.3 + i * (2 * Math.PI / K);
        orbita.push({ n: n, tx: centro.x + Math.cos(ang) * R, ty: centro.y + Math.sin(ang) * R,
                      x0: n.x, y0: n.y });
      });
      if (!orbita.length) return;
      var idSet = {};
      orbita.forEach(function (o) { idSet[o.n.id] = true; });
      despliegue = { centro: centro, orbita: orbita, ids: idSet, t: reduce ? 1 : 0 };
      centro.fx = centro.x; centro.fy = centro.y;      // ancla el centro
      if (reduce) orbita.forEach(function (o) { o.n.fx = o.tx; o.n.fy = o.ty; o.n.x = o.tx; o.n.y = o.ty; });
    }
    function pasoDespliegue() {
      if (!despliegue || despliegue.t >= 1) return;
      despliegue.t = Math.min(1, despliegue.t + 0.09);
      var e = despliegue.t * (2 - despliegue.t);        // ease-out
      despliegue.orbita.forEach(function (o) {
        o.n.fx = o.x0 + (o.tx - o.x0) * e; o.n.fy = o.y0 + (o.ty - o.y0) * e;
        o.n.x = o.n.fx; o.n.y = o.n.fy;
      });
    }
    // punto sobre el cable-estela (quadratic con caída hacia abajo en +y)
    function puntoCable(a, b, p) {
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var caida = Math.hypot(b.x - a.x, b.y - a.y) * 0.22;
      var cx = mx, cy = my + caida;   // control desplazado hacia abajo
      var u = 1 - p;
      return [u * u * a.x + 2 * u * p * cx + p * p * b.x,
              u * u * a.y + 2 * u * p * cy + p * p * b.y, cx, cy];
    }
    // partículas sinápticas (S1S1R1 §3.2c): solo Nocturne, 5%/tick por cable
    // activo, vel 0.004–0.007, color = nodo origen, máx 30. Ornamento
    // cancelable — Math.random aquí es la única aleatoriedad permitida.
    function pasoParticulas() {
      if (!despliegue || esLight || reduce) { if (particulas.length) particulas = []; return; }
      for (var i = particulas.length - 1; i >= 0; i--) {
        particulas[i].p += particulas[i].sp;
        if (particulas[i].p >= 1) particulas.splice(i, 1);
      }
      if (particulas.length < 30 && Math.random() < 0.12) {
        var o = despliegue.orbita[Math.floor(Math.random() * despliegue.orbita.length)];
        if (o) particulas.push({ a: despliegue.centro, b: o.n, p: 0,
                                 sp: 0.004 + Math.random() * 0.003,
                                 color: colorNodo(despliegue.centro) });
      }
    }
    function replegarFunnel(reasentar) {
      if (!despliegue) return;
      despliegue.orbita.forEach(function (o) { o.n.fx = null; o.n.fy = null; });
      despliegue.centro.fx = null; despliegue.centro.fy = null;
      despliegue = null; particulas = [];
      if (reasentar && sim && !reduce) { sim.alfa(Math.max(sim.alfa(), 0.3)); animar(); }
    }

    // encuadre: centra el CORAZÓN del caso (todo menos el halo de
    // fragmentos, que es enorme y vacía la vista) llenando el 84% del
    // lienzo. Automático al cargar/asentar/redimensionar; manual con el
    // botón reencuadrar y doble-tap en el fondo.
    function encuadrar() {
      if (!nodos.length) return;
      vistaManual = false;
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, nucleo = null;
      nodos.forEach(function (n) {
        if (n.kind === 'nucleo') nucleo = n;
        if (n.kind === 'fragmento') return;   // el halo no dicta el encuadre
        if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
      });
      if (minX > maxX) {                       // caso raro: solo fragmentos
        nodos.forEach(function (n) {
          if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
        });
      }
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var k = Math.min(6, Math.max(0.25,
        0.84 * Math.min(w / Math.max(maxX - minX, 60), h / Math.max(maxY - minY, 60))));
      vista.k = k;
      // centrado en el núcleo de sesión cuando existe; si no, en la caja
      var cx = nucleo ? nucleo.x : (minX + maxX) / 2;
      var cy = nucleo ? nucleo.y : (minY + maxY) / 2;
      vista.x = -cx * k;
      vista.y = -cy * k;
    }

    // zoom por botón: ancla el punto que está al centro del lienzo
    function zoomCentro(factor) {
      var wx = -vista.x / vista.k, wy = -vista.y / vista.k;
      vista.k = Math.min(6, Math.max(0.25, vista.k * factor));
      vista.x = -wx * vista.k; vista.y = -wy * vista.k;
      vistaManual = true;
      if (!animando) dibujar(0);
    }

    // ── dibujo ───────────────────────────────────────────────────────
    function dibujar(ts) {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      // Limpieza a prueba de estado sucio: si un frame anterior murió a
      // media transformación, un clearRect relativo deja residuo (el
      // "glitch" de estelas). Reset absoluto y se vuelve a la base DPR.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.translate(w / 2 + vista.x, h / 2 + vista.y);
      ctx.scale(vista.k, vista.k);

      var foco = sel || hover;
      var visibles = foco ? vecinos[foco.id] || {} : null;
      if (resalte) { visibles = null; }
      // un foco muy conectado (p.ej. un racimo abierto) no debe etiquetar sus
      // decenas de hojas: se enciman. Sus vecinos estructurales sí.
      var focoGrande = visibles && Object.keys(visibles).length > 16;

      // enlaces — trazos con presencia: la estructura se tiene que VER
      enlaces.forEach(function (e) {
        var a = porId[e.source], b = porId[e.target];
        if (!a || !b) return;
        // cable-estela: arista activa del funnel (centro ↔ órbita)
        if (despliegue && ((e.source === despliegue.centro.id && despliegue.ids[e.target]) ||
                           (e.target === despliegue.centro.id && despliegue.ids[e.source]))) {
          var pc = puntoCable(a, b, 0);
          ctx.setLineDash([]); ctx.globalAlpha = 0.9;
          ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(pc[2], pc[3], b.x, b.y); ctx.stroke();
          return;
        }
        var toca = foco && (e.source === foco.id || e.target === foco.id);
        var apagado = leyOculta(a.kind) || leyOculta(b.kind) ||
          (resalte ? !resalte.enlaces[e.id] : (foco && !toca));
        if (resalte && resalte.enlaces[e.id]) { toca = true; }
        var cae = whatif && resalte && resalte.enlaces[e.id];   // arista que muere en la simulación
        ctx.globalAlpha = apagado ? 0.07 : (cae ? 0.85 : (e.kind === 'relacion' ? 0.8 : 0.3));
        ctx.strokeStyle = cae ? colores.danger : (e.kind === 'relacion' ? colores.acc : colores.linea2);
        ctx.lineWidth = cae ? 1.6 : (e.kind === 'relacion' ? 1.3 + (e.peso || 0.5) * 2 : 1.0);
        ctx.setLineDash(cae ? [3, 4] : (e.kind === 'cita' ? [4, 6] : []));
        ctx.beginPath(); ctx.moveTo(a.x, a.y);
        // aristas inter-comunidad se curvan (PANOPTES §4.3): el punto de
        // control se desplaza perpendicular al vano, así los saltos entre
        // racimos se leen como cableado y cruzan menos; intra-comunidad recto
        if (a.comunidad != null && b.comunidad != null && a.comunidad !== b.comunidad) {
          var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          var ex = b.x - a.x, ey = b.y - a.y;
          ctx.quadraticCurveTo(mx - ey * 0.12, my + ex * 0.12, b.x, b.y);
        } else {
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // partículas sinápticas viajando por los cables activos (S1S1R1 §3.2c)
      if (particulas.length) {
        for (var pi = 0; pi < particulas.length; pi++) {
          var pt = particulas[pi], qp = puntoCable(pt.a, pt.b, pt.p);
          ctx.globalAlpha = 0.9; ctx.fillStyle = pt.color;
          ctx.beginPath(); ctx.arc(qp[0], qp[1], 2.2, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // nodos — lenguaje ojo-sensor por tier (PANOPTES §5). El glow masivo
      // sigue proscrito: los cientos de hojas van limpias, solo los HUB
      // llevan anillos maquinados + núcleo incandescente. El glow/burn real
      // se reserva a las Δ (F3b).
      nodos.forEach(function (n) {
        var r = radioDe(n);
        var apagado = leyOculta(n.kind) || (resalte ? !resalte.nodos[n.id]
          : (foco && n !== foco && !(visibles && visibles[n.id])));
        var tier = tierDe(n);
        var col = colorNodo(n);

        if (apagado) {
          // modo tenue: contorno láser sutil — presente, no fantasma
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = conAlfa(colores.acc, 0.55);
          ctx.lineWidth = 0.9;
          trazarForma(n, r); ctx.stroke();
          ctx.globalAlpha = 1;
          return;
        }

        ctx.globalAlpha = 1;
        var vivo = n.kind === 'entidad';           // Coral: inteligencia viva

        // efectos DETRÁS del nodo: glow/burn de la alerta
        if (n.kind === 'anomalia' && n.severidad) glowBurn(n, r, ts);
        // el nodo que se simula caer arde como alerta crítica (P3)
        if (whatif && n.id === whatif.id) glowBurn({ x: n.x, y: n.y, severidad: 'danger' }, r, ts);

        var detalle = r * vista.k >= 13;   // LOD: el detalle mecha se apaga de lejos
        if (n.kind === 'nucleo') {
          // α · corona de funnels (dial + núcleo contenido + 3 cuchillos)
          dibujarCorona(n, r, ts, n === foco, detalle);
        } else if (n.kind === 'pedimento') {
          // pedimento · dardo Anubis orientado a su ancla
          dibujarDardo(n, r, col, n === foco, detalle);
        } else if (tier === 'hub') {
          // carcasa (anillo exterior) + mecanizado (anillo medio) + iris
          // (marcas radiales) + núcleo incandescente = el ojo-sensor
          ctx.strokeStyle = col; ctx.globalAlpha = 0.9;
          ctx.lineWidth = n === foco ? 2.4 : 1.4;
          trazarForma(n, r); ctx.stroke();
          ctx.globalAlpha = 0.45; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.72, 0, 6.283); ctx.stroke();
          ctx.globalAlpha = 0.3;
          for (var t = 0; t < 10; t++) {
            var ang = (n.seed || 0) + t * 0.6283;
            var cx = Math.cos(ang), cy = Math.sin(ang);
            ctx.beginPath();
            ctx.moveTo(n.x + cx * r * 0.8, n.y + cy * r * 0.8);
            ctx.lineTo(n.x + cx * r * 0.98, n.y + cy * r * 0.98);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          nucleoIncandescente(n, r, nucleoDe(n));
        } else if (tier === 'hoja') {
          // hoja: forma mínima, sin núcleo — legibilidad y fps
          ctx.strokeStyle = col; ctx.lineWidth = n === foco ? 2.0 : 1.0;
          trazarForma(n, r); ctx.stroke();
        } else {
          // MEDIO: anillo simple + relleno vivo (entidad) + punto de energía
          ctx.strokeStyle = col; ctx.lineWidth = n === foco ? 2.4 : 1.5;
          ctx.fillStyle = vivo ? conAlfa(colores.acc, 0.28) : 'rgba(0,0,0,0)';
          trazarForma(n, r);
          if (vivo) ctx.fill();
          ctx.stroke();
          if (!vivo) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, Math.max(1.3, r * 0.28), 0, 6.283);
            ctx.fillStyle = nucleoDe(n); ctx.fill();
          }
        }

        // puente de articulación (PANOPTES §4.2): el nodo cuyo retiro parte
        // el caso en dos — oro analítico, se enfatiza con un doble anillo
        if (n.puente && n.kind !== 'nucleo') {   // la corona ya marca al sujeto
          ctx.globalAlpha = 0.6; ctx.strokeStyle = col; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 4, 0, 6.283); ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // selección: anillo punteado giratorio + afterburn (quietos bajo
        // reduced-motion)
        if (n === sel) {
          afterburn(n, r, ts);
          ctx.save();
          ctx.strokeStyle = colores.acc; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
          ctx.lineDashOffset = reduce ? 0 : -(ts || 0) / 60;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 7, 0, 6.283); ctx.stroke();
          ctx.restore();
        }

        // glifo griego DENTRO del nodo (LOD §6.3): visible si el radio en
        // pantalla ≥ 7px y no es hoja; nombra la clase del objeto. Sobre el
        // relleno vivo (entidad) va en --t1 para contrastar; el triángulo Δ
        // baja el glifo a su centro geométrico.
        // (α y pedimento ya no llevan glifo central: la silueta ES su identidad)
        if (n.glifo && r * vista.k >= 7 && tier !== 'hoja'
            && n.kind !== 'nucleo' && n.kind !== 'pedimento') {
          var dyG = n.kind === 'anomalia' ? r * 0.26 : r * 0.02;
          ctx.font = '700 ' + (r * 1.15) + 'px "JetBrains Mono", monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = vivo ? colores.t1 : col;
          ctx.fillText(n.glifo, n.x, n.y + dyG);
          ctx.textBaseline = 'alphabetic';
        }

        // badge de fragmentos colapsados en la Σ (×N σ): el halo cabe en un
        // contador, no en cientos de nodos
        if (n.kind === 'artefacto' && !mostrarFragmentos && badgeFrag[n.id]
            && r * vista.k >= 6) {
          ctx.font = '700 ' + (8 / vista.k) + 'px "JetBrains Mono", monospace';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillStyle = colores.acc;
          ctx.fillText('×' + badgeFrag[n.id], n.x + r + 3 / vista.k, n.y - r + 2 / vista.k);
          ctx.textBaseline = 'alphabetic';
        }

        // meta-nodo de racimo: indicador plegable (+/−) — es tocable
        if (n.meta && r * vista.k >= 6) {
          ctx.font = '700 ' + (10 / vista.k) + 'px "JetBrains Mono", monospace';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillStyle = colores.acc;
          ctx.fillText(n.abierto ? '−' : '+', n.x + r + 3 / vista.k, n.y - r + 2 / vista.k);
          ctx.textBaseline = 'alphabetic';
        }

        // etiqueta con LOD: siempre las estructurales y el meta; el resto por
        // centralidad al zoom medio, PERO nunca inundamos con las hojas
        // (vehículo/fragmento) — esas solo en foco o zoom alto, si no un
        // racimo expandido tapiza la pantalla de etiquetas encimadas
        var esHoja = n.kind === 'vehiculo' || n.kind === 'fragmento';
        var conEtiqueta = ['nucleo', 'pedimento', 'marca', 'pais', 'producto'].indexOf(n.kind) >= 0
          || n.meta || n === foco
          || (visibles && visibles[n.id] && !(esHoja && focoGrande))
          || (resalte && resalte.nodos[n.id])
          || (vista.k > 1.6 && !esHoja)
          || (vista.k > 3 && esHoja)      // hojas: solo con zoom muy alto (inspección)
          || ((n.centralidad || 0) >= 0.5 && vista.k >= 0.8 && !esHoja);
        if (conEtiqueta) {
          // piso de legibilidad: la etiqueta nunca baja de 10px en pantalla
          ctx.font = (10 / vista.k) + 'px "JetBrains Mono", monospace';
          ctx.fillStyle = n === foco ? colores.t1 : colores.t3;
          ctx.textAlign = 'center';
          // etiqueta defensiva: un null de datos reales no puede tirar el frame
          ctx.fillText(String(n.etiqueta || '').slice(0, 26), n.x, n.y + r + 11 / vista.k);
        }
      });
      ctx.restore();

      // brackets de esquina (chasis del instrumento)
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
      [[8, 8, 22, 8, 8, 22], [w - 8, 8, w - 22, 8, w - 8, 22],
       [8, h - 8, 22, h - 8, 8, h - 22], [w - 8, h - 8, w - 22, h - 8, w - 8, h - 22]]
        .forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[4], c[5]); ctx.stroke();
        });
      ctx.globalAlpha = 1;

      dibujarGuias();   // líneas guía + reposición de las tarjetas callout
    }

    // ── gestos ───────────────────────────────────────────────────────
    var arrastre = { nodo: null, panX: 0, panY: 0, activo: false, movido: false };
    var punteros = {};

    function aMundo(px, py) {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      return [(px - w / 2 - vista.x) / vista.k, (py - h / 2 - vista.y) / vista.k];
    }
    function nodoEn(px, py) {
      var m = aMundo(px, py), mejor = null, mejorD = 1e9;
      nodos.forEach(function (n) {
        var dx = n.x - m[0], dy = n.y - m[1], d = dx * dx + dy * dy;
        var alcance = Math.max(radioDe(n) + 6, 12 / vista.k);
        if (n.kind === 'pedimento') alcance = Math.max(alcance, largoDardo(radioDe(n)) / 2);
        if (d < alcance * alcance && d < mejorD) { mejor = n; mejorD = d; }
      });
      return mejor;
    }
    function xy(ev) {
      var caja = canvas.getBoundingClientRect();
      return [ev.clientX - caja.left, ev.clientY - caja.top];
    }

    canvas.addEventListener('pointerdown', function (ev) {
      canvas.setPointerCapture(ev.pointerId);
      punteros[ev.pointerId] = xy(ev);
      if (Object.keys(punteros).length > 1) return;   // pinch toma el control
      var p = xy(ev);
      arrastre.activo = true; arrastre.movido = false;
      arrastre.nodo = nodoEn(p[0], p[1]);
      arrastre.panX = p[0]; arrastre.panY = p[1];
      if (arrastre.nodo && sim) { sim.alfa(Math.max(sim.alfa(), 0.25)); if (!reduce) animar(); }
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (punteros[ev.pointerId]) punteros[ev.pointerId] = xy(ev);
      var ids = Object.keys(punteros);
      if (ids.length === 2) {                          // pinch
        var a = punteros[ids[0]], b = punteros[ids[1]];
        var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        // un pinch nunca es tap ni arrastre de nodo
        if (arrastre.nodo) { arrastre.nodo.fx = null; arrastre.nodo.fy = null; }
        arrastre.activo = false; arrastre.nodo = null; arrastre.movido = true;
        if (arrastre.pinchD) {
          var factor = d / arrastre.pinchD;
          var antes = aMundo(mx, my);
          vista.k = Math.min(6, Math.max(0.25, vista.k * factor));
          var despues = aMundo(mx, my);
          // ancla el zoom al punto medio de los dedos y pan de dos dedos
          vista.x += (despues[0] - antes[0]) * vista.k + (mx - arrastre.pinchMX);
          vista.y += (despues[1] - antes[1]) * vista.k + (my - arrastre.pinchMY);
          vistaManual = true;
        }
        arrastre.pinchD = d; arrastre.pinchMX = mx; arrastre.pinchMY = my;
        if (!animando) dibujar(0);
        return;
      }
      if (!arrastre.activo) {
        var p0 = xy(ev);
        var h0 = nodoEn(p0[0], p0[1]);
        if (h0 !== hover) { hover = h0; canvas.style.cursor = h0 ? 'pointer' : 'grab'; if (!animando) dibujar(0); }
        return;
      }
      var p = xy(ev);
      var dx = p[0] - arrastre.panX, dy = p[1] - arrastre.panY;
      if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movido = true;
      if (arrastre.nodo) {
        var m = aMundo(p[0], p[1]);
        arrastre.nodo.fx = m[0]; arrastre.nodo.fy = m[1];
        if (reduce) { sim && sim.correr(2); dibujar(0); }
      } else {
        vista.x += dx; vista.y += dy;
        vistaManual = true;
        arrastre.panX = p[0]; arrastre.panY = p[1];
        if (!animando) dibujar(0);
      }
    });
    function soltar(ev) {
      delete punteros[ev.pointerId];
      arrastre.pinchD = null; arrastre.pinchMX = 0; arrastre.pinchMY = 0;
      if (!arrastre.activo) return;
      if (!arrastre.movido) {                          // tap
        var p = xy(ev);
        var golpe = nodoEn(p[0], p[1]);
        if (modoCamino) {                              // segundo nodo: traza el camino
          if (golpe && golpe.id !== modoCamino.desde) trazarCamino(modoCamino.desde, golpe.id);
          else if (estadoLinea) colapsar();            // cancela: repinta el estado
          modoCamino = null; canvas.style.cursor = 'grab';
        } else if (golpe && golpe.meta) {              // racimo ν×N: desplegar/plegar
          expandidos[golpe.ped] = !expandidos[golpe.ped];
          sel = null; hover = null; pintarInspector(null); replegarFunnel(false);
          vistaManual = false;
          colapsar(); reconstruirSim();
        } else {                                       // seleccionar
          sel = golpe;
          pintarInspector(sel);
          if (sel) { resalte = null; abrirTarjeta(sel); desplegarFunnel(sel); }
          else { cerrarActivas(); replegarFunnel(true); }
          if (!animando) dibujar(0);
          arrancarLatido();                            // afterburn + funnel
        }
      }
      if (arrastre.nodo) { arrastre.nodo.fx = null; arrastre.nodo.fy = null; }
      arrastre.activo = false; arrastre.nodo = null;
    }
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);
    canvas.addEventListener('dblclick', function (ev) {
      var p = xy(ev);
      if (!nodoEn(p[0], p[1])) { encuadrar(); if (!animando) dibujar(0); }
    });
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var factor = Math.pow(1.0015, -ev.deltaY);
      var p = xy(ev);
      var antes = aMundo(p[0], p[1]);
      vista.k = Math.min(6, Math.max(0.25, vista.k * factor));
      vistaManual = true;
      var despues = aMundo(p[0], p[1]);
      vista.x += (despues[0] - antes[0]) * vista.k;
      vista.y += (despues[1] - antes[1]) * vista.k;
      if (!animando) dibujar(0);
    }, { passive: false });

    // ── inspector ────────────────────────────────────────────────────
    function pintarInspector(n) {
      if (!inspector) return;
      if (!n) {
        inspector.innerHTML = '<p class="gr-vacio">Toca un nodo para abrir su expediente.</p>';
        return;
      }
      // mismo dossier por-tipo que la tarjeta callout (consistencia), sin los
      // controles flotantes; el panel es la vista fija del expediente.
      var f = fichaDossier(n);
      inspector.innerHTML =
        '<div class="gr-kind">' + esc(n.meta ? 'RACIMO · ν×N' : n.kind.toUpperCase()) + '</div>' +
        '<div class="gr-nombre">' + esc(n.etiqueta) + '</div>' +
        (f.sub ? '<div class="gr-tar-sub">' + esc(f.sub) + '</div>' : '') +
        f.cuerpo;
    }

    // ── tarjetas callout (PANOPTES §6) ────────────────────────────────
    // ficha técnica anclada al nodo por una línea guía; hasta 2 fijadas para
    // comparar. Todo texto extraído pasa por esc(). El panel lateral se
    // conserva y se sincroniza (decisión del operador: ambos visibles).
    capaTarjetas = document.createElement('div');
    capaTarjetas.className = 'gr-capa-tarjetas';
    cont.appendChild(capaTarjetas);

    function pantallaDe(n) {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      return [w / 2 + vista.x + n.x * vista.k, h / 2 + vista.y + n.y * vista.k];
    }
    // ── helpers del dossier (contenido por TIPO de nodo) ──────────────
    function fNum(v) { return (+v || 0).toLocaleString('es-MX'); }
    function fMon(v) { v = +v || 0; if (!v) return null;
      if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
      if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'k'; return '$' + Math.round(v); }
    function ex(n, k) { return (n.extra && n.extra[k] != null && n.extra[k] !== '') ? n.extra[k] : null; }
    function fila(label, val, hi) { if (val == null || val === '') return '';
      return '<div class="gr-fila"><span>' + esc(label) + '</span><b' + (hi ? ' class="hi"' : '') +
        '>' + esc(val) + '</b></div>'; }
    function hero(big, sub, cls) { return '<div class="gr-tar-hero"><div class="gr-tar-big' +
      (cls ? ' ' + cls : '') + '">' + esc(big) + '</div><div class="gr-tar-unit">' + sub + '</div></div>'; }
    function barraJN(j, n) { j = +j || 0; n = +n || 0; var t = j + n; if (!t) return '';
      var jp = Math.round(j / t * 100);
      return '<div class="gr-jn"><i class="j" style="width:' + jp + '%"></i>' +
        '<i class="n" style="width:' + (100 - jp) + '%"></i></div>' +
        '<div class="gr-jnlab"><span>J · ' + jp + '%</span><span>N · ' + (100 - jp) + '%</span></div>'; }
    // vecinos VISIBLES de un kind dado (deriva ficha sin red)
    function vecinosKind(n, kind) { var out = [], vs = vecinos[n.id] || {};
      Object.keys(vs).forEach(function (id) { var v = porId[id]; if (v && v.kind === kind) out.push(v); });
      return out; }
    function statsEntidad(n) { var rel = 0, conf = 0, arts = vecinosKind(n, 'artefacto');
      enlaces.forEach(function (e) {
        if (e.kind === 'relacion' && (e.source === n.id || e.target === n.id)) {
          rel++; conf = Math.max(conf, e.peso || 0); } });
      return { rel: rel, conf: conf, arts: arts }; }
    // totales del caso sobre el payload RAW (no depende del colapso)
    function totalesCaso() { var t = { veh: 0, anom: 0, marca: 0, pais: 0, art: 0 };
      nodosRaw.forEach(function (n) {
        if (n.kind === 'vehiculo') t.veh++; else if (n.kind === 'anomalia') t.anom++;
        else if (n.kind === 'marca') t.marca++; else if (n.kind === 'pais') t.pais++;
        else if (n.kind === 'artefacto') t.art++; });
      return t; }
    function volumenTotalMarcas() { var s = 0;
      nodosRaw.forEach(function (n) { if (n.kind === 'marca' && n.extra) s += (+n.extra.volumen || 0); });
      return s; }
    function botonAccion(a) {
      var lab = { vecindario: 'Vecindario', camino: 'Camino a…', centrar: 'Centrar',
        afectados: 'Ver afectados', expandir: 'Expandir', caida: 'Simular caída' }[a] || a;
      var key = (a === 'vecindario' || a === 'afectados' || a === 'expandir' || a === 'caida') ? ' key' : '';
      return '<button type="button" class="gr-tar-accion' + key + '" data-accion="' + a + '">' + esc(lab) + '</button>';
    }
    function filasBasicas(n) { var out = fila('conexiones', n.grado || 0), extra = n.extra || {};
      Object.keys(extra).forEach(function (kk) {
        if (extra[kk] != null && extra[kk] !== '' && kk !== 'virtual') out += fila(kk, extra[kk]); });
      return out; }
    function claseCard(n) {
      if (n.kind === 'anomalia') return n.severidad === 'danger' ? 'gr-dng' : 'gr-warn';
      if (n.kind === 'pais') return 'gr-cob';
      return ''; }
    // sección dueña de un nodo, para el deep-link "Abrir en"
    function destinoDe(n) {
      if (n.kind === 'artefacto') return ['/autogenes/ingesta', 'Ingesta'];
      if (n.kind === 'anomalia') {
        var motor = n.extra && n.extra.motor;
        if (motor === 'validacion') return ['/autogenes/validacion', 'Validación'];
        if (motor === 'nomos') return ['/autogenes/nomos', 'Nomos'];
        return ['/autogenes/concilia', 'Concilia'];
      }
      if (n.kind === 'producto') return ['/autogenes/sintesis', 'Síntesis'];
      return null;
    }
    // ficha por TIPO (compartida por la tarjeta callout y el inspector lateral)
    function fichaDossier(n) {
      var k = n.kind, cuerpo = '', acc = [], sub = '';

      if (n.meta) {                                   // racimo ν×N
        sub = 'colapsados bajo un pedimento';
        cuerpo = hero(fNum(n.conteo), 'UNIDADES' + (ex(n, 'tipo') ? '<br>' + esc(ex(n, 'tipo')) : ''));
        var rango = (ex(n, 'precio_min') != null) ? fMon(ex(n, 'precio_min')) + '–' + fMon(ex(n, 'precio_max')) : null;
        cuerpo += fila('rango precio', rango) + fila('valor Σ', fMon(ex(n, 'valor')), true);
        acc = ['expandir', 'centrar'];
      } else if (k === 'nucleo') {                    // α · caso
        var t = totalesCaso();
        sub = 'una sola fuente de la verdad';
        cuerpo = hero(fNum(t.veh), 'VEHÍCULOS<br>en el caso');
        cuerpo += fila('anomalías', t.anom ? fNum(t.anom) + ' · a revisar' : 'sin anomalías', t.anom > 0);
        cuerpo += fila('marcas · países', t.marca + ' · ' + t.pais);
        cuerpo += fila('fuentes', t.art || null);
        cuerpo += fila('nodos · enlaces', nodosRaw.length + ' · ' + enlacesRaw.length);
        acc = ['centrar'];
      } else if (k === 'marca') {
        var vt = volumenTotalMarcas(), vol = +ex(n, 'volumen') || 0;
        sub = ex(n, 'modelos') ? (ex(n, 'modelos') + ' modelos distintos') : '';
        cuerpo = hero(fNum(vol), 'UNIDADES' + (vt ? '<br>' + Math.round(vol / vt * 100) + '% del volumen' : ''));
        cuerpo += barraJN(ex(n, 'pref_j'), ex(n, 'pref_n'));
        cuerpo += fila('modelo líder', ex(n, 'modelo_lider') ? ex(n, 'modelo_lider') + ' · ' + fNum(ex(n, 'lider_n')) : null, true);
        cuerpo += fila('orígenes', ex(n, 'origenes'));
        cuerpo += fila('valor Σ', fMon(ex(n, 'valor_sigma')));
        acc = ['vecindario', 'camino', 'caida', 'centrar'];
      } else if (k === 'pais') {
        sub = ex(n, 'marcas') ? (ex(n, 'marcas') + ' marcas de origen') : '';
        cuerpo = hero(fNum(ex(n, 'volumen') || 0), 'UNIDADES<br>importadas');
        cuerpo += barraJN(ex(n, 'pref_j'), ex(n, 'pref_n'));
        cuerpo += fila('marcas', ex(n, 'marcas'), true);
        cuerpo += fila('valor Σ', fMon(ex(n, 'valor_sigma')));
        acc = ['vecindario', 'camino', 'caida', 'centrar'];
      } else if (k === 'pedimento') {
        sub = (ex(n, 'patente') ? 'patente ' + ex(n, 'patente') : '') +
              (ex(n, 'aduana') ? ' · ' + ex(n, 'aduana') : '');
        cuerpo = hero(fNum(ex(n, 'n_vehiculos') || 0), 'VEHÍCULOS' + (ex(n, 'valor') ? '<br>' + fMon(ex(n, 'valor')) + ' valor' : ''));
        cuerpo += fila('aduana', ex(n, 'aduana')) + fila('fecha', ex(n, 'fecha'));
        acc = ['vecindario', 'caida', 'centrar'];
      } else if (k === 'vehiculo') {
        var mv = vecinosKind(n, 'marca')[0], pv = vecinosKind(n, 'pais')[0];
        sub = 'chasis · unidad de la flota';
        cuerpo = fila('modelo', n.tipo) + fila('marca', mv ? mv.etiqueta : null) +
                 fila('origen', pv ? pv.etiqueta : null) +
                 fila('precio', fMon(ex(n, 'precio')), true) + fila('preferencia', ex(n, 'j_y_n'));
        acc = ['vecindario', 'centrar'];
      } else if (k === 'anomalia') {
        var sev = n.severidad === 'danger';
        sub = 'motor ' + (ex(n, 'motor') || '—');
        cuerpo = '<span class="gr-chip ' + (sev ? 'crit' : 'warn') + '">● ' +
          (sev ? 'Crítico' : 'Revisar') + ' · ' + esc(n.severidad || 'warn') + '</span>';
        if (ex(n, 'detalle')) cuerpo += '<div class="gr-diag">' + esc(ex(n, 'detalle')) + '</div>';
        cuerpo += fila('motor', ex(n, 'motor')) + fila('regla', ex(n, 'regla_id')) +
                  fila('afectados', ex(n, 'n_unidades') ? fNum(ex(n, 'n_unidades')) + ' unidades' : null, true);
        acc = ['afectados', 'camino'];
      } else if (k === 'entidad') {
        var st = statsEntidad(n);
        sub = 'memoria · ' + (ex(n, 'origen') || n.tipo || 'entidad');
        cuerpo = fila('tipo', n.tipo) + fila('procedencia', ex(n, 'origen')) +
                 fila('relaciones', st.rel || null, st.rel > 0) +
                 fila('confianza', st.conf ? st.conf.toFixed(2) : null);
        if (st.arts.length) cuerpo += '<div class="gr-prov">CITA · ' + st.arts.length + ' fuente' +
          (st.arts.length !== 1 ? 's' : '') + '<br>' + st.arts.slice(0, 3).map(function (a) {
            return '<span class="gr-frag">Σ ' + esc(a.etiqueta) + '</span>'; }).join('') + '</div>';
        acc = ['vecindario', 'centrar'];
      } else if (k === 'artefacto') {
        sub = (n.tipo ? n.tipo.toUpperCase() : 'FUENTE') + (ex(n, 'virtual') ? ' · virtual' : '');
        cuerpo = fila('fragmentos', badgeFrag[n.id] ? fNum(badgeFrag[n.id]) : null, true) +
                 fila('entidades citadas', vecinosKind(n, 'entidad').length || null);
        acc = ['vecindario', 'centrar'];
      } else if (k === 'producto') {
        sub = 'producto dockeado' + (n.tipo ? ' · ' + n.tipo : '');
        cuerpo = fila('clase', n.tipo) + fila('entidades', vecinosKind(n, 'entidad').length || null) +
                 fila('fuentes', vecinosKind(n, 'artefacto').length || null);
        acc = ['vecindario', 'centrar'];
      } else {
        cuerpo = filasBasicas(n);
        acc = ['vecindario', 'centrar'];
      }
      return { sub: sub, cuerpo: cuerpo, acc: acc };
    }
    function contenidoTarjeta(n) {
      var dest = destinoDe(n), f = fichaDossier(n);
      var accHTML = f.acc.map(botonAccion).join('') +
        (dest ? '<button type="button" class="gr-tar-accion" data-accion="abrir">Abrir en ' + esc(dest[1]) + '</button>' : '');
      return '<div class="gr-tar-accent"></div>' +
        '<div class="gr-tar-head">' +
        '<span class="gr-tar-glifo" style="color:' + colorNodo(n) + '">' + esc(n.glifo || '·') + '</span>' +
        '<span class="gr-tar-kind">' + esc(n.meta ? 'racimo · ν×N' : n.kind) + '</span>' +
        '<button type="button" class="gr-tar-btn" data-pin aria-pressed="false" aria-label="Fijar tarjeta">⇱</button>' +
        '<button type="button" class="gr-tar-btn" data-x aria-label="Cerrar tarjeta">×</button>' +
        '</div>' +
        '<div class="gr-tar-nombre">' + esc(n.etiqueta) + '</div>' +
        (f.sub ? '<div class="gr-tar-sub">' + esc(f.sub) + '</div>' : '') +
        f.cuerpo +
        '<div class="gr-tar-acciones">' + accHTML + '</div>';
    }
    function accionTarjeta(a, n) {
      if (a === 'centrar') {
        vistaManual = true; vista.k = Math.max(vista.k, 1.6);
        vista.x = -n.x * vista.k; vista.y = -n.y * vista.k;
        if (!animando) dibujar(0);
      } else if (a === 'abrir') {
        var d = destinoDe(n);
        if (d) window.location.href = d[0];
      } else if (a === 'camino') {
        modoCamino = { desde: n.id };
        if (estadoLinea) estadoLinea.textContent = 'CAMINO DESDE ' +
          (n.etiqueta || n.id).toUpperCase().slice(0, 24) + ' — ELIGE EL DESTINO';
        canvas.style.cursor = 'crosshair';
      } else if (a === 'vecindario') {
        var rn = {}, re = {};
        rn[n.id] = true;
        Object.keys(vecinos[n.id] || {}).forEach(function (id) { rn[id] = true; });
        enlaces.forEach(function (e) {
          if ((e.source === n.id && rn[e.target]) || (e.target === n.id && rn[e.source])) re[e.id] = true;
        });
        // segundo clic sobre el mismo vecindario lo apaga
        resalte = (resalte && resalte.nodos[n.id] && Object.keys(resalte.nodos).length === Object.keys(rn).length)
          ? null : { nodos: rn, enlaces: re };
        if (!animando) dibujar(0);
      } else if (a === 'afectados') {
        accionTarjeta('vecindario', n);   // los Δ citan a sus unidades afectadas
      } else if (a === 'caida') {
        simularCaida(n);
      } else if (a === 'expandir' && n.ped) {
        expandidos[n.ped] = !expandidos[n.ped];   // despliega el racimo ν×N
        colapsar(); if (!animando) dibujar(0);
      }
    }
    function abrirTarjeta(n) {
      if (!n || n.kind === 'fragmento') return;
      if (tarjetas.some(function (t) { return t.nodo.id === n.id; })) return;
      // retira la activa (no fijada) previa y respeta el tope de 2
      tarjetas = tarjetas.filter(function (t) {
        if (!t.fijada) { capaTarjetas.removeChild(t.el); return false; }
        return true;
      });
      while (tarjetas.length >= 2) { capaTarjetas.removeChild(tarjetas.shift().el); }
      var el = document.createElement('div');
      el.className = 'gr-tarjeta ' + claseCard(n);
      el.innerHTML = contenidoTarjeta(n);
      capaTarjetas.appendChild(el);
      var card = { nodo: n, el: el, fijada: false };
      tarjetas.push(card);
      el.querySelector('[data-x]').addEventListener('click', function () { cerrarTarjeta(card); });
      el.querySelector('[data-pin]').addEventListener('click', function (ev) {
        card.fijada = !card.fijada;
        el.classList.toggle('fijada', card.fijada);
        ev.currentTarget.setAttribute('aria-pressed', card.fijada ? 'true' : 'false');
      });
      el.querySelectorAll('[data-accion]').forEach(function (btn) {
        btn.addEventListener('click', function () { accionTarjeta(btn.getAttribute('data-accion'), n); });
      });
      if (!animando) dibujar(0);
    }
    function cerrarTarjeta(card) {
      var i = tarjetas.indexOf(card);
      if (i >= 0) { capaTarjetas.removeChild(card.el); tarjetas.splice(i, 1); }
    }
    function cerrarActivas() {
      tarjetas = tarjetas.filter(function (t) {
        if (!t.fijada) { capaTarjetas.removeChild(t.el); return false; }
        return true;
      });
    }
    // traza el camino más corto entre dos nodos (endpoint camino) y lo aísla
    // por resalte. Nota: el camino se calcula sobre el grafo completo; un
    // tramo por un nodo colapsado resalta su arista remapeada al meta.
    function trazarCamino(desde, hasta) {
      if (estadoLinea) estadoLinea.textContent = 'TRAZANDO EL CAMINO…';
      fetch('/api/v1/autogenes/camino?desde=' + encodeURIComponent(desde) +
            '&hasta=' + encodeURIComponent(hasta))
        .then(function (r) { return r.json(); })
        .then(function (g) {
          if (!g || !g.camino) {
            if (estadoLinea) estadoLinea.textContent = g && g.mensaje ? g.mensaje.toUpperCase() : 'SIN CAMINO';
            return;
          }
          var rn = {}, re = {};
          g.camino.saltos.forEach(function (s) {
            rn[s.de.id] = true; rn[s.a.id] = true;
            if (s.arista && s.arista.id) re[s.arista.id] = true;
          });
          resalte = { nodos: rn, enlaces: re };
          if (estadoLinea) estadoLinea.textContent = 'CAMINO · ' + g.camino.largo +
            (g.camino.largo === 1 ? ' SALTO' : ' SALTOS');
          if (!animando) dibujar(0);
        })
        .catch(function () { if (estadoLinea) estadoLinea.textContent = 'ERROR AL TRAZAR EL CAMINO'; });
    }

    // ── what-if de caída (P3, DECIDIR) ────────────────────────────────
    // El motor vive en el servidor (cascada.simular_caida vía qualia): mide,
    // sobre la red de ESTA sesión, qué le hace al caso quitar un nodo. El
    // cliente jamás dicta el número; solo lo surfacea. Copy honesto por ley:
    // simula la red propia, no predice el mundo (cascada.py). Las cifras salen
    // del grafo completo; el resalte visual sigue lo visible del lienzo.
    function simularCaida(n) {
      if (estadoLinea) estadoLinea.textContent = 'SIMULANDO LA CAÍDA DE ' +
        (n.etiqueta || n.id).toUpperCase().slice(0, 24) + '…';
      fetch('/api/v1/autogenes/qualia/cascada?caida=' + encodeURIComponent(n.id))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || d.error) {
            if (estadoLinea) estadoLinea.textContent = d && d.error ? d.error.toUpperCase() : 'SIN SIMULACIÓN';
            return;
          }
          whatif = { id: n.id, r: d };
          // resalte = nodo caído + sus vecinos VISIBLES + las aristas que lo tocan
          var rn = {}, re = {};
          rn[n.id] = true;
          Object.keys(vecinos[n.id] || {}).forEach(function (id) { rn[id] = true; });
          enlaces.forEach(function (e) {
            if (e.source === n.id || e.target === n.id) re[e.id] = true;
          });
          resalte = { nodos: rn, enlaces: re };
          pintarWhatif(n, d);
          if (estadoLinea) estadoLinea.textContent = 'SIMULACIÓN · CAÍDA DE ' +
            (n.etiqueta || n.id).toUpperCase().slice(0, 24);
          if (!animando) dibujar(0);
        })
        .catch(function () { if (estadoLinea) estadoLinea.textContent = 'ERROR EN LA SIMULACIÓN'; });
    }
    // el veredicto en lenguaje llano, cada cifra medida por el motor
    function pintarWhatif(n, d) {
      if (!inspector) return;
      var pct = Math.round((d.peso_estructural || 0) * 100);
      var pctTxt = pct < 1 ? '<1%' : pct + '%';
      var directo = (d.ondas && d.ondas[1]) ? d.ondas[1].length : (d.relaciones_caidas || 0);
      var parte = d.islas_despues > d.islas_antes;
      var fragTxt = parte ? 'el caso se parte en ' + d.islas_despues + ' islas'
                          : 'el caso no se fragmenta';
      var desc = d.desconectados || [];
      var aislTxt = desc.length
        ? fNum(desc.length) + ' · ' + desc.slice(0, 3).map(function (x) {
            return esc((x.etiqueta || x.id).slice(0, 18)); }).join(', ')
        : 'ninguno · conservan otras citas';
      inspector.innerHTML =
        '<div class="gr-kind gr-kind-sim">SIMULACIÓN · CAÍDA</div>' +
        '<div class="gr-nombre">' + esc(n.etiqueta) + '</div>' +
        '<div class="gr-tar-sub">qué le hace al caso quitar este nodo</div>' +
        hero(pctTxt, 'DE LA ESTRUCTURA<br>que carga este nodo') +
        fila('vínculos que caen', fNum(d.relaciones_caidas || 0), true) +
        fila('alcance directo', fNum(directo) + ' nodos') +
        fila('fragmentación', fragTxt, parte) +
        fila('quedan aislados', aislTxt, desc.length > 0) +
        '<p class="gr-sim-nota">Simulación sobre la red de esta sesión — no predice el mundo.</p>' +
        '<div class="gr-tar-acciones"><button type="button" class="gr-tar-accion key" data-sim-cerrar>Cerrar simulación</button></div>';
      var btn = inspector.querySelector('[data-sim-cerrar]');
      if (btn) btn.addEventListener('click', cerrarWhatif);
    }
    function cerrarWhatif() {
      whatif = null; resalte = null;
      if (estadoLinea) estadoLinea.textContent = '';
      pintarInspector(sel);
      if (!animando) dibujar(0);
    }
    // posiciona cada tarjeta en el cuadrante opuesto al nodo y traza su
    // línea guía (canvas, espacio de pantalla). Llamada desde dibujar().
    function dibujarGuias() {
      if (!tarjetas.length || !capaTarjetas) return;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var movil = w < 640, m = 16, puestas = [];
      for (var i = 0; i < tarjetas.length; i++) {
        var t = tarjetas[i], p = pantallaDe(t.nodo);
        if (movil) continue;   // hoja inferior por CSS, sin línea guía
        var cw = t.el.offsetWidth || 264, ch = t.el.offsetHeight || 120;
        var cx = p[0] < w / 2 ? Math.min(w - cw - m, p[0] + 64) : Math.max(m, p[0] - cw - 64);
        var cy = p[1] < h / 2 ? Math.min(h - ch - m, p[1] + 34) : Math.max(m, p[1] - ch - 34);
        // evita solapar con las tarjetas ya colocadas: la empuja debajo (o
        // encima si no cabe) de la que estorba
        for (var g = 0; g < puestas.length; g++) {
          var o = puestas[g];
          if (cx < o.x + o.w && cx + cw > o.x && cy < o.y + o.h && cy + ch > o.y) {
            var abajo = o.y + o.h + 10;
            cy = (abajo + ch <= h - m) ? abajo : Math.max(m, o.y - ch - 10);
          }
        }
        cy = Math.max(m, Math.min(h - ch - m, cy));
        t.el.style.left = Math.round(cx) + 'px';
        t.el.style.top = Math.round(cy) + 'px';
        puestas.push({ x: cx, y: cy, w: cw, h: ch });
        var ax = (cx + cw / 2 < p[0]) ? cx + cw : cx, ay = cy + Math.min(ch / 2, 22);
        ctx.save();
        ctx.strokeStyle = colores.acc; ctx.globalAlpha = t.fijada ? 0.85 : 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 6.283); ctx.stroke();
        var qx = (p[0] + ax) / 2;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        ctx.lineTo(qx, p[1]); ctx.lineTo(qx, ay); ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── controles externos ──────────────────────────────────────────
    var buscar = q(cont.getAttribute('data-buscar'));
    var datalistEl = document.getElementById('gr-nodos');
    function pintarDatalist() {
      if (!datalistEl) return;
      var vistos = {}, ops = [];
      for (var i = 0; i < nodos.length && ops.length < 300; i++) {
        var e = nodos[i].etiqueta;
        if (e && !vistos[e]) { vistos[e] = true; ops.push('<option value="' + esc(e) + '">'); }
      }
      datalistEl.innerHTML = ops.join('');
    }
    if (buscar) {
      buscar.addEventListener('change', function () {
        var texto = buscar.value.trim().toLowerCase();
        if (!texto) return;
        var n = nodos.find(function (x) { return x.etiqueta && x.etiqueta.toLowerCase() === texto; })
          || nodos.find(function (x) { return x.etiqueta && x.etiqueta.toLowerCase().indexOf(texto) >= 0; });
        if (n) {
          sel = n; resalte = null; pintarInspector(n); abrirTarjeta(n);
          vistaManual = true; vista.k = Math.max(vista.k, 1.8);
          vista.x = -n.x * vista.k; vista.y = -n.y * vista.k;
          if (!animando) dibujar(0);
          arrancarLatido();
        }
      });
    }
    // teclado: Esc sale de cualquier modo (camino, aislar, resalte, selección)
    canvas.setAttribute('tabindex', '0');
    canvas.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        modoCamino = null; canvas.style.cursor = 'grab';
        kindAislado = null; kindsAtenuados = {}; resalte = null; whatif = null;
        sel = null; pintarInspector(null); cerrarActivas(); replegarFunnel(true);
        if (typeof pintarLeyenda === 'function') pintarLeyenda();
        colapsar(); if (!animando) dibujar(0);
      }
    });
    var reset = q(cont.getAttribute('data-reset'));
    if (reset) {
      reset.addEventListener('click', function () {
        sel = null; pintarInspector(null);
        encuadrar();
        if (!animando) dibujar(0);
      });
    }
    var zmas = q(cont.getAttribute('data-zmas'));
    if (zmas) zmas.addEventListener('click', function () { zoomCentro(1.35); });
    var zmenos = q(cont.getAttribute('data-zmenos'));
    if (zmenos) zmenos.addEventListener('click', function () { zoomCentro(1 / 1.35); });
    var cap = q(cont.getAttribute('data-cap'));
    if (cap) cap.addEventListener('change', function () { cargar(cap.value || null); });
    var frag = q(cont.getAttribute('data-frag'));
    if (frag) {
      var pintarFrag = function () {
        frag.setAttribute('aria-pressed', mostrarFragmentos ? 'true' : 'false');
        frag.textContent = mostrarFragmentos ? 'σ fragmentos' : 'σ ocultos';
      };
      pintarFrag();
      frag.addEventListener('click', function () {
        mostrarFragmentos = !mostrarFragmentos;
        pintarFrag();
        vistaManual = false;      // deja que el nuevo set se reencuadre
        colapsar();
        reconstruirSim();
      });
    }
    // leyenda viva (PANOPTES §8): clic atenúa una clase, doble clic la aísla
    var leyendaEl = q(cont.getAttribute('data-leyenda'));
    var aisladoEl = q(cont.getAttribute('data-aislado'));
    if (leyendaEl) {
      leyendaEl.querySelectorAll('.gr-chip').forEach(function (chip) {
        var k = chip.getAttribute('data-kind'), tClic = null;
        chip.addEventListener('click', function () {
          clearTimeout(tClic);
          tClic = setTimeout(function () {          // clic simple: atenuar
            if (kindAislado) kindAislado = null;
            kindsAtenuados[k] = !kindsAtenuados[k];
            pintarLeyenda(); if (!animando) dibujar(0);
          }, 200);
        });
        chip.addEventListener('dblclick', function () {  // doble: aislar (duotono)
          clearTimeout(tClic);
          kindsAtenuados = {};
          kindAislado = (kindAislado === k) ? null : k;
          pintarLeyenda(); if (!animando) dibujar(0);
        });
      });
    }
    if (aisladoEl) {
      var salir = aisladoEl.querySelector('#gr-aislado-salir');
      if (salir) salir.addEventListener('click', function () {
        kindAislado = null; kindsAtenuados = {};
        pintarLeyenda(); if (!animando) dibujar(0);
      });
    }
    function pintarLeyenda() {
      if (!leyendaEl) return;
      var cuenta = {};
      nodosRaw.forEach(function (n) { cuenta[n.kind] = (cuenta[n.kind] || 0) + 1; });
      leyendaEl.querySelectorAll('.gr-chip').forEach(function (chip) {
        var k = chip.getAttribute('data-kind');
        var em = chip.querySelector('.gr-chip-n');
        if (em) em.textContent = cuenta[k] || 0;
        chip.setAttribute('aria-pressed', leyOculta(k) ? 'false' : 'true');
        chip.classList.toggle('aislado', kindAislado === k);
      });
      if (aisladoEl) {
        aisladoEl.hidden = !kindAislado;
        var t = aisladoEl.querySelector('.gr-aislado-t');
        if (t && kindAislado) t.textContent = 'Aislando · ' + kindAislado;
      }
    }

    // API para vistas que cabalgan el lienzo (Vínculos)
    cont.grafoAPI = {
      nodos: function () { return nodos; },
      resaltar: function (idsNodos, idsEnlaces) {
        var rn = {}, re = {};
        (idsNodos || []).forEach(function (i) { rn[i] = true; });
        (idsEnlaces || []).forEach(function (i) { re[i] = true; });
        resalte = { nodos: rn, enlaces: re };
        if (!animando) dibujar(0);
      },
      limpiar: function () { resalte = null; sel = null; pintarInspector(null); if (!animando) dibujar(0); },
      encuadrar: function () { encuadrar(); if (!animando) dibujar(0); },
      enfocar: function (id) {
        var n = porId[id];
        if (!n) return;
        sel = n; pintarInspector(n);
        vistaManual = true;
        vista.k = Math.max(vista.k, 1.4);
        vista.x = -n.x * vista.k; vista.y = -n.y * vista.k;
        if (!animando) dibujar(0);
        arrancarLatido();
      }
    };

    // ── Deep-link del estado del grafo (L1) ───────────────────────────
    // El estado visual vive en el hash de la URL: pegar la URL reproduce la
    // vista EXACTA (viewport, selección, filtros, racimos, fragmentos). Las
    // posiciones son deterministas, así que la cámara guardada las reencuentra.
    // Se escribe por sondeo con replaceState — no inunda el historial del
    // navegador; es el snapshot que P1 (investigaciones) guardará.
    function serializarEstado() {
      var p = [];
      if (sesionId) p.push('s=' + sesionId);
      p.push('k=' + vista.k.toFixed(3));
      p.push('x=' + Math.round(vista.x));
      p.push('y=' + Math.round(vista.y));
      if (sel) p.push('n=' + encodeURIComponent(sel.id));
      if (kindAislado) p.push('a=' + encodeURIComponent(kindAislado));
      var aten = Object.keys(kindsAtenuados).filter(function (k) { return kindsAtenuados[k]; });
      if (aten.length) p.push('f=' + aten.map(encodeURIComponent).join(','));
      var exp = Object.keys(expandidos).filter(function (k) { return expandidos[k]; });
      if (exp.length) p.push('e=' + exp.map(encodeURIComponent).join(','));
      if (mostrarFragmentos) p.push('g=1');
      return p.join('&');
    }
    function parsearHash() {
      var h = (location.hash || '').replace(/^#/, '');
      if (!h) return null;
      var o = {};
      h.split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
      });
      return o;
    }
    function leerEstadoInicial() {
      var o = parsearHash();
      if (!o) return;
      // pre-carga: estos afectan el colapso, así que se fijan ANTES de cargar
      if (o.g === '1') mostrarFragmentos = true;
      if (o.e) o.e.split(',').forEach(function (id) { expandidos[id] = true; });
      if (o.a) kindAislado = o.a;
      if (o.f) o.f.split(',').forEach(function (k) { kindsAtenuados[k] = true; });
      estadoPendiente = { k: parseFloat(o.k), x: parseFloat(o.x),
                          y: parseFloat(o.y), n: o.n || null };
    }
    function aplicarEstadoPendiente() {
      if (!estadoPendiente) return;
      var e = estadoPendiente; estadoPendiente = null;
      if (isFinite(e.k) && isFinite(e.x) && isFinite(e.y)) {
        vista.k = e.k; vista.x = e.x; vista.y = e.y; vistaManual = true;
      }
      if (e.n && porId[e.n]) { sel = porId[e.n]; pintarInspector(sel); arrancarLatido(); }
      if (typeof pintarLeyenda === 'function') pintarLeyenda();
      if (!animando) dibujar(0);
    }
    var ultimoHash = null;
    function guardarEstado() {
      var s = serializarEstado();
      if (s === ultimoHash) return;
      ultimoHash = s;
      try { history.replaceState(null, '', location.pathname + location.search + '#' + s); }
      catch (err) { /* algunos navegadores bloquean replaceState en local file */ }
    }

    // ── Paleta de comandos (P7): Ctrl/Cmd+K — toda acción sin ratón ────
    // Búsqueda de nodos (reusa el índice del lienzo) + acciones nombradas en
    // español. Keyboard-first: flechas navegan, Enter ejecuta, Escape cierra.
    var paleta = document.createElement('div');
    paleta.className = 'gr-paleta';
    paleta.hidden = true;
    paleta.setAttribute('role', 'dialog');
    paleta.setAttribute('aria-modal', 'true');
    paleta.setAttribute('aria-label', 'Paleta de comandos');
    paleta.innerHTML =
      '<div class="gr-paleta-caja">' +
      '<input class="gr-paleta-input" type="text" autocomplete="off" spellcheck="false" ' +
      'placeholder="Buscar comando o nodo…" aria-label="Buscar comando o nodo" ' +
      'role="combobox" aria-controls="gr-paleta-lista" aria-expanded="true">' +
      '<ul class="gr-paleta-lista" id="gr-paleta-lista" role="listbox"></ul>' +
      '</div>';
    cont.appendChild(paleta);
    var paletaInput = paleta.querySelector('.gr-paleta-input');
    var paletaLista = paleta.querySelector('.gr-paleta-lista');
    var paletaItems = [], paletaIdx = 0, paletaAbierta = false;

    function comandosGlobales() {
      var cmds = [
        { et: 'Reencuadrar el grafo', hint: 'vista',
          run: function () { vistaManual = false; encuadrar(); if (!animando) dibujar(0); } },
        { et: 'Acercar', hint: 'zoom', run: function () { zoomCentro(1.35); } },
        { et: 'Alejar', hint: 'zoom', run: function () { zoomCentro(1 / 1.35); } },
        { et: 'Mostrar u ocultar fragmentos σ', hint: 'filtro',
          run: function () { if (frag) frag.click(); } },
        { et: 'Limpiar selección y modos', hint: 'salir', run: function () {
            modoCamino = null; canvas.style.cursor = 'grab';
            kindAislado = null; kindsAtenuados = {}; resalte = null; whatif = null;
            sel = null; pintarInspector(null); cerrarActivas(); replegarFunnel(true);
            if (typeof pintarLeyenda === 'function') pintarLeyenda();
            colapsar(); if (!animando) dibujar(0);
          } }
      ];
      if (sel && (sel.kind === 'marca' || sel.kind === 'pais' || sel.kind === 'pedimento')) {
        cmds.push({ et: 'Simular caída de ' + sel.etiqueta, hint: 'what-if',
          run: (function (n) { return function () { simularCaida(n); }; })(sel) });
      }
      return cmds;
    }
    function comandosNodo(texto) {
      var out = [], vistos = {};
      for (var i = 0; i < nodos.length && out.length < 40; i++) {
        var n = nodos[i];
        if (!n.etiqueta || n.kind === 'fragmento' || vistos[n.etiqueta]) continue;
        if (texto && n.etiqueta.toLowerCase().indexOf(texto) < 0) continue;
        vistos[n.etiqueta] = true;
        out.push({ et: n.etiqueta, hint: 'ir a · ' + n.kind,
          run: (function (nn) { return function () {
            sel = nn; resalte = null; whatif = null; pintarInspector(nn); abrirTarjeta(nn);
            vistaManual = true; vista.k = Math.max(vista.k, 1.8);
            vista.x = -nn.x * vista.k; vista.y = -nn.y * vista.k;
            if (!animando) dibujar(0); arrancarLatido();
          }; })(n) });
      }
      return out;
    }
    function pintarPaleta(texto) {
      texto = (texto || '').trim().toLowerCase();
      var globs = comandosGlobales().filter(function (c) {
        return !texto || c.et.toLowerCase().indexOf(texto) >= 0;
      });
      paletaItems = globs.concat(comandosNodo(texto));
      paletaIdx = 0;
      paletaLista.innerHTML = paletaItems.length
        ? paletaItems.map(function (c, i) {
            return '<li class="gr-paleta-item' + (i === 0 ? ' sel' : '') + '" role="option"' +
              ' aria-selected="' + (i === 0 ? 'true' : 'false') + '" data-i="' + i + '">' +
              '<span>' + esc(c.et) + '</span><em>' + esc(c.hint) + '</em></li>';
          }).join('')
        : '<li class="gr-paleta-vacio">Sin coincidencias</li>';
    }
    function marcarPaleta() {
      paletaLista.querySelectorAll('.gr-paleta-item').forEach(function (el, i) {
        var s = i === paletaIdx;
        el.classList.toggle('sel', s);
        el.setAttribute('aria-selected', s ? 'true' : 'false');
        if (s) el.scrollIntoView({ block: 'nearest' });
      });
    }
    function ejecutarPaleta(i) {
      var c = paletaItems[i];
      cerrarPaleta();
      if (c) c.run();
    }
    function abrirPaleta() {
      paletaAbierta = true; paleta.hidden = false;
      paletaInput.value = ''; pintarPaleta('');
      paletaInput.focus();
    }
    function cerrarPaleta() {
      paletaAbierta = false; paleta.hidden = true;
      if (canvas.focus) canvas.focus();
    }
    paletaInput.addEventListener('input', function () { pintarPaleta(paletaInput.value); });
    paletaInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); paletaIdx = Math.min(paletaIdx + 1, paletaItems.length - 1); marcarPaleta(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); paletaIdx = Math.max(paletaIdx - 1, 0); marcarPaleta(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); ejecutarPaleta(paletaIdx); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cerrarPaleta(); }
    });
    paletaLista.addEventListener('click', function (ev) {
      var li = ev.target.closest('[data-i]');
      if (li) ejecutarPaleta(+li.getAttribute('data-i'));
    });
    paleta.addEventListener('click', function (ev) {
      if (ev.target === paleta) cerrarPaleta();   // clic en el velo cierra
    });
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) {
        ev.preventDefault();
        if (paletaAbierta) cerrarPaleta(); else abrirPaleta();
      }
    });

    leerColores();
    tamano();
    window.addEventListener('resize', function () {
      tamano();
      if (!vistaManual) encuadrar();
      if (!animando) dibujar(0);
    });
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); if (!animando) dibujar(0); }, 60);
    });
    leerEstadoInicial();          // aplica el hash de la URL antes de la 1ª carga (L1)
    cargar(cap && cap.value ? cap.value : 150);
    setInterval(guardarEstado, 700);   // vuelca el estado al hash (deep-link vivo)
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.gr-lienzo').forEach(montar);
  });
})();
