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
    var base = { nucleo: 14, pedimento: 8, marca: 9, pais: 8, vehiculo: 3.2,
                 artefacto: 6.5, fragmento: 2.2, entidad: 6.5, producto: 7.5,
                 anomalia: 8.5 }[n.kind] || 4;
    return base + Math.min(6, Math.sqrt(n.grado || 0) * 0.9);
  }

  // Tiers de render (PANOPTES §5): HUB = ojo-sensor (anillos maquinados +
  // núcleo incandescente); MEDIO = anillo simple + glifo; HOJA = forma
  // mínima. Los kinds estructurales son HUB; un nodo-hoja con centralidad
  // alta sube a MEDIO para que no se pierda.
  var TIER_HUB = { nucleo: 1, marca: 1, pedimento: 1, pais: 1, producto: 1 };
  var TIER_HOJA = { vehiculo: 1, fragmento: 1 };
  function tierDe(n) {
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
    var sim = null, animando = false, latiendo = false, t0 = 0;
    var vista = { x: 0, y: 0, k: 1 };
    var sel = null, hover = null;
    var resalte = null;          // {nodos:{}, enlaces:{}} — camino/vecindario
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
      var rr = r + 10;
      ctx.save();
      if (reduce) {
        if (esLight) {
          ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 6.283); ctx.stroke();
        } else {
          ctx.shadowColor = color; ctx.shadowBlur = 14;
          ctx.fillStyle = conAlfa(color, 0.5);
          ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 6.283); ctx.fill();
        }
        ctx.restore(); return;
      }
      var f = fase(periodo, ts);
      if (esLight) {
        ctx.globalAlpha = 0.12 + 0.88 * f;
        ctx.strokeStyle = color; ctx.lineWidth = n.severidad === 'danger' ? 2.6 : 3.4;
        ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 6.283); ctx.stroke();
      } else {
        ctx.globalAlpha = 0.12 + 0.66 * f;
        ctx.shadowColor = color; ctx.shadowBlur = 8 + 14 * f;
        ctx.fillStyle = conAlfa(color, 0.6);
        ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 6.283); ctx.fill();
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
        nodos = g.nodos; enlaces = g.enlaces; porId = {}; vecinos = {};
        nodos.forEach(function (n) { porId[n.id] = n; });
        enlaces.forEach(function (e) {
          (vecinos[e.source] = vecinos[e.source] || {})[e.target] = true;
          (vecinos[e.target] = vecinos[e.target] || {})[e.source] = true;
        });
        sel = null; pintarInspector(null);
        if (estadoLinea) {
          estadoLinea.textContent = nodos.length + ' NODOS · ' + enlaces.length +
            ' ENLACES · SESIÓN ' + (g.session_id || '—');
        }
        var nucleo = nodos.find(function (n) { return n.kind === 'nucleo'; });
        if (nucleo) { nucleo.x = 0; nucleo.y = 0; nucleo.fx = 0; nucleo.fy = 0; }
        sim = Fuerzas.simulacion(nodos, enlaces,
                                 { anillos: ANILLOS, fuerzaPorKind: FUERZA_ANILLO });
        if (reduce) { sim.correr(300); encuadrar(); dibujar(0); }
        else { sim.correr(60); encuadrar(); animar(); }
        cont.dispatchEvent(new CustomEvent('grafo:listo', { detail: { nodos: nodos } }));
      }).catch(function () {
        if (mia !== reqSeq) return;
        if (estadoLinea) estadoLinea.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
      });
    }

    function animar() {
      if (animando) return;
      animando = true;
      (function paso(ts) {
        var alfa = sim ? sim.tick() : 0;
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
      if (sel) return true;
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
        dibujar(ts);
        requestAnimationFrame(pulso);
      });
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

      // enlaces — trazos con presencia: la estructura se tiene que VER
      enlaces.forEach(function (e) {
        var a = porId[e.source], b = porId[e.target];
        if (!a || !b) return;
        var toca = foco && (e.source === foco.id || e.target === foco.id);
        var apagado = resalte ? !resalte.enlaces[e.id] : (foco && !toca);
        if (resalte && resalte.enlaces[e.id]) { toca = true; }
        ctx.globalAlpha = apagado ? 0.07 : (e.kind === 'relacion' ? 0.8 : 0.3);
        ctx.strokeStyle = e.kind === 'relacion' ? colores.acc : colores.linea2;
        ctx.lineWidth = e.kind === 'relacion' ? 1.3 + (e.peso || 0.5) * 2 : 1.0;
        ctx.setLineDash(e.kind === 'cita' ? [4, 6] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      ctx.setLineDash([]);

      // nodos — lenguaje ojo-sensor por tier (PANOPTES §5). El glow masivo
      // sigue proscrito: los cientos de hojas van limpias, solo los HUB
      // llevan anillos maquinados + núcleo incandescente. El glow/burn real
      // se reserva a las Δ (F3b).
      nodos.forEach(function (n) {
        var r = radioDe(n);
        var apagado = resalte ? !resalte.nodos[n.id]
          : (foco && n !== foco && !(visibles && visibles[n.id]));
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

        // etiqueta con LOD: prioridad por centralidad (no solo grado)
        var conEtiqueta = ['nucleo', 'pedimento', 'marca', 'pais', 'producto'].indexOf(n.kind) >= 0
          || n === foco || (visibles && visibles[n.id]) || (resalte && resalte.nodos[n.id])
          || (vista.k > 1.6 && n.kind !== 'fragmento')
          || ((n.centralidad || 0) >= 0.45 && vista.k >= 0.8);
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
      if (!arrastre.movido) {                          // tap: seleccionar
        var p = xy(ev);
        sel = nodoEn(p[0], p[1]);
        pintarInspector(sel);
        if (!animando) dibujar(0);
        arrancarLatido();                              // afterburn de la selección
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

    // ── controles externos ──────────────────────────────────────────
    var buscar = q(cont.getAttribute('data-buscar'));
    if (buscar) {
      buscar.addEventListener('change', function () {
        var q = buscar.value.trim().toLowerCase();
        if (!q) return;
        var n = nodos.find(function (x) { return x.etiqueta.toLowerCase().indexOf(q) >= 0; });
        if (n) {
          sel = n; pintarInspector(n);
          vista.k = 1.8; vista.x = -n.x * vista.k; vista.y = -n.y * vista.k;
          if (!animando) dibujar(0);
          arrancarLatido();
        }
      });
    }
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
