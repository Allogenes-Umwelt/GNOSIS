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
      return colores.t1;   // nucleo, pedimento, marca, producto (Frame)
    }
    // color del núcleo incandescente: cian salvo país (cobalt) y Δ (severidad)
    function nucleoDe(n) {
      if (n.kind === 'anomalia') {
        return n.severidad === 'danger' ? colores.danger : colores.warn;
      }
      if (n.kind === 'pais') return colores.cobalt;
      return colores.acc;
    }
    function trazarForma(n, r) {
      ctx.beginPath();
      if (n.kind === 'artefacto' || n.kind === 'fragmento') {
        ctx.rect(n.x - r, n.y - r, r * 2, r * 2);            // Frame: documental
      } else if (n.kind === 'pedimento') {
        ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y);
        ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y); ctx.closePath();
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

    // Halo del sujeto α (S1S1R1 §3.3): anillo exterior que respira; pulsa
    // solo mientras el latido corre (hay actividad), estático si no.
    function haloAlfa(n, r, ts) {
      var a = (reduce || !latiendo) ? 0.3 : 0.18 + 0.27 * fase(3500, ts);
      ctx.save();
      ctx.globalAlpha = a; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 14, 0, 6.283); ctx.stroke();
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
        metaNodos.push({
          id: metaId, kind: 'vehiculo', meta: true, abierto: abierto,
          conteo: vehs.length, glifo: 'ν', etiqueta: vehs.length + ' vehículos',
          ped: pedId, comunidad: ped ? ped.comunidad : 0, centralidad: 0.35,
          seed: (ped ? ped.seed : 0) || 0,
          x: ped ? ped.x : undefined, y: ped ? ped.y : undefined
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
      var ids = {};
      orbita.forEach(function (o) { ids[o.n.id] = true; });
      despliegue = { centro: centro, orbita: orbita, ids: ids, t: reduce ? 1 : 0 };
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
        ctx.globalAlpha = apagado ? 0.07 : (e.kind === 'relacion' ? 0.8 : 0.3);
        ctx.strokeStyle = e.kind === 'relacion' ? colores.acc : colores.linea2;
        ctx.lineWidth = e.kind === 'relacion' ? 1.3 + (e.peso || 0.5) * 2 : 1.0;
        ctx.setLineDash(e.kind === 'cita' ? [4, 6] : []);
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

        // efectos DETRÁS del nodo: glow/burn de la alerta, halo del sujeto
        if (n.kind === 'anomalia' && n.severidad) glowBurn(n, r, ts);
        if (n.kind === 'nucleo') haloAlfa(n, r, ts);

        if (tier === 'hub') {
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
        if (n.puente) {
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
        if (n.glifo && r * vista.k >= 7 && tier !== 'hoja') {
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
      var extra = n.extra || {};
      var filas = Object.keys(extra)
        .filter(function (k) { return extra[k] != null && extra[k] !== '' && k !== 'virtual'; })
        .map(function (k) {
          return '<div class="gr-fila"><span>' + esc(k) + '</span><b>' + esc(extra[k]) + '</b></div>';
        })
        .join('');
      inspector.innerHTML =
        '<div class="gr-kind">' + esc(n.kind.toUpperCase()) + (n.tipo ? ' · ' + esc(n.tipo) : '') +
        (extra.virtual ? ' · VIRTUAL' : '') + '</div>' +
        '<div class="gr-nombre">' + esc(n.etiqueta) + '</div>' +
        '<div class="gr-fila"><span>conexiones</span><b>' + (n.grado || 0) + '</b></div>' + filas;
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
    function filasTarjeta(n) {
      var filas = [['conexiones', n.grado || 0]];
      if (n.severidad) filas.push(['severidad', n.severidad]);
      var extra = n.extra || {};
      Object.keys(extra).forEach(function (k) {
        if (extra[k] != null && extra[k] !== '' && k !== 'virtual') filas.push([k, extra[k]]);
      });
      return filas.map(function (f) {
        return '<div class="gr-fila"><span>' + esc(f[0]) + '</span><b>' + esc(f[1]) + '</b></div>';
      }).join('');
    }
    // sección dueña de un nodo, para el deep-link "Abrir en"
    function destinoDe(n) {
      if (n.kind === 'artefacto') return ['/autogenes/ingesta', 'Ingesta'];
      if (n.kind === 'anomalia') {
        return (n.extra && n.extra.motor === 'validacion')
          ? ['/autogenes/validacion', 'Validación'] : ['/autogenes/concilia', 'Concilia'];
      }
      if (n.kind === 'producto') return ['/autogenes/sintesis', 'Síntesis'];
      return null;
    }
    function contenidoTarjeta(n) {
      var dest = destinoDe(n);
      return '<div class="gr-tar-head">' +
        '<span class="gr-tar-glifo" style="color:' + colorNodo(n) + '">' + esc(n.glifo || '·') + '</span>' +
        '<span class="gr-tar-kind">' + esc((n.meta ? 'racimo' : n.kind)) +
          (n.tipo ? ' · ' + esc(n.tipo) : '') + ((n.extra && n.extra.virtual) ? ' · virtual' : '') + '</span>' +
        '<button type="button" class="gr-tar-btn" data-pin aria-pressed="false" aria-label="Fijar tarjeta">⇱</button>' +
        '<button type="button" class="gr-tar-btn" data-x aria-label="Cerrar tarjeta">×</button>' +
        '</div>' +
        '<div class="gr-tar-nombre">' + esc(n.etiqueta) + '</div>' +
        filasTarjeta(n) +
        '<div class="gr-tar-acciones">' +
        '<button type="button" class="gr-tar-accion" data-accion="vecindario">Vecindario</button>' +
        '<button type="button" class="gr-tar-accion" data-accion="camino">Camino a…</button>' +
        '<button type="button" class="gr-tar-accion" data-accion="centrar">Centrar</button>' +
        (dest ? '<button type="button" class="gr-tar-accion" data-accion="abrir">Abrir en ' + esc(dest[1]) + '</button>' : '') +
        '</div>';
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
      el.className = 'gr-tarjeta';
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
        kindAislado = null; kindsAtenuados = {}; resalte = null;
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
    cargar(cap && cap.value ? cap.value : 150);
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.gr-lienzo').forEach(montar);
  });
})();
