/* GNOSIS · Qualia — Cascada de bifurcación (F7d, port de LienzoCascada).
   El what-if como fibra óptica: la red yace en fibras oscuras sobre su
   embedding espectral (computado en servidor, determinista); elegir un
   nodo lanza un pulso de luz por el frente BFS REAL que computó el
   motor de cascada — la animación ES el cómputo, un anillo por paso.
   Modo caída: qué muere si el nodo cae (nodo tachado, fibras muertas se
   apagan, huérfanos anillados). Modo enlace: el vínculo simulado pulsa
   primero. El pulso corre UNA vez y se resuelve a estado encendido
   estático; prefers-reduced-motion arranca ahí. Pulso en cian (--acc):
   es simulación de inteligencia viva, no alerta — el magenta queda
   reservado al Terreno. Nada escribe: materializar un enlace pasa por
   el plan aditivo. Datos: /qualia/red?espectral=1 y /qualia/cascada. */
(function () {
  'use strict';

  var MS_POR_PASO = 450;

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qc-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    var elModo = document.getElementById('qc-modo');
    var elInfo = document.getElementById('qc-info');
    var elHint = document.getElementById('qc-hint');
    var elImpacto = document.getElementById('qc-impacto');
    var elHuerfanos = document.getElementById('qc-huerfanos');
    var btnLimpiar = document.getElementById('qc-limpiar');
    var elMsj = document.getElementById('qc-msj');

    var colores = {};
    var datos = null;            // /qualia/red?espectral=1
    var modo = 'caida';
    var seleccion = [];          // 1 id (caída) o 2 ids (enlace)
    var ondas = [];              // frente BFS del motor
    var anilloDe = {};           // id -> índice de anillo
    var huerfanos = {};          // ids anillados en el estado resuelto
    var caido = null;
    var inicio = 0;              // arranque del pulso
    var animando = false;
    var vista = { x: 0, y: 0, k: 1 };
    var posPantalla = [];        // para el tap
    var reqSeq = 0;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function alfa(hex, a) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
             ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    function leerColores() {
      var cs = getComputedStyle(document.documentElement);
      colores = {
        acc: cs.getPropertyValue('--acc-text').trim() || '#00D4FF',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA',
        fondo: cs.getPropertyValue('--surface').trim() || '#0A0A0A'
      };
    }
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = Math.max(420, caja.height) * dpr;
      canvas.style.height = Math.max(420, caja.height) + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // proyección del embedding espectral por el viewport navegable
    function proyector(w, h) {
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      Object.keys(datos.espectral).forEach(function (id) {
        var q = datos.espectral[id];
        if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
        if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
      });
      var m = 34;
      var k = 0.92 * Math.min((w - 2 * m) / Math.max(maxX - minX, 1e-6),
                              (h - 2 * m) / Math.max(maxY - minY, 1e-6)) * vista.k;
      var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      return function (id) {
        var q = datos.espectral[id];
        if (!q) return null;
        return [w / 2 + (q.x - cx) * k + vista.x,
                h / 2 + (q.y - cy) * k + vista.y];
      };
    }

    function dibujar(ts) {
      if (!datos) return;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var pasoMax = ondas.length + 0.5;
      var paso = (reduce || !ondas.length) ? pasoMax
        : Math.min(pasoMax, ((ts || performance.now()) - inicio) / MS_POR_PASO);
      var resuelto = paso >= pasoMax;

      ctx.clearRect(0, 0, w, h);
      var p = proyector(w, h);

      // fibras: canales oscuros; una fibra enciende mientras el pulso
      // cruza entre sus anillos; las muertas se apagan al resolver
      datos.red.enlaces.forEach(function (e) {
        var a = p(e.origen), b = p(e.destino);
        if (!a || !b) return;
        var muerta = caido !== null && (e.origen === caido || e.destino === caido);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = alfa(colores.linea, muerta && resuelto ? 0.06 : 0.2);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (ondas.length > 0 && !muerta) {
          var ka = anilloDe[e.origen], kb = anilloDe[e.destino];
          if (ka !== undefined && kb !== undefined && Math.abs(ka - kb) === 1) {
            var kk = Math.max(ka, kb);
            var brillo = resuelto ? 0.22 : Math.max(0, 1 - Math.abs(paso - kk)) * 0.7;
            if (brillo > 0.01) {
              ctx.beginPath();
              ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
              ctx.strokeStyle = alfa(colores.acc, brillo);
              ctx.lineWidth = 1.4;
              ctx.stroke();
            }
          }
        }
      });

      // el enlace simulado: fibra viva que pulsa primero (anillo 0 → 1)
      if (modo === 'enlace' && seleccion.length === 2) {
        var a2 = p(seleccion[0]), b2 = p(seleccion[1]);
        if (a2 && b2) {
          ctx.beginPath();
          ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]);
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = alfa(colores.acc, resuelto ? 0.9 : 0.55);
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.setLineDash([]);
          if (!resuelto && paso <= 1) {
            var t = Math.max(0, Math.min(1, paso));
            ctx.beginPath();
            ctx.arc(a2[0] + (b2[0] - a2[0]) * t, a2[1] + (b2[1] - a2[1]) * t,
                    4, 0, 6.283);
            ctx.fillStyle = colores.acc;
            ctx.fill();
          }
        }
      }

      // nodos: gris documental hasta que el pulso llega a su anillo
      posPantalla = [];
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      datos.red.nodos.forEach(function (n) {
        var q = p(n.id);
        if (!q) return;
        var x = q[0], y = q[1];
        posPantalla.push({ x: x, y: y, id: n.id });
        var k = anilloDe[n.id];
        var alcanzado = k !== undefined && paso >= k;
        var esSel = seleccion.indexOf(n.id) >= 0;
        var esCaido = caido === n.id;
        var esHuerfano = resuelto && huerfanos[n.id];

        if (alcanzado && !esCaido) {
          var brillo = resuelto ? 0.35 : Math.max(0.35, 1 - (paso - (k || 0)) * 0.4);
          var glow = ctx.createRadialGradient(x, y, 0, x, y, 11);
          glow.addColorStop(0, alfa(colores.acc, 0.5 * brillo));
          glow.addColorStop(1, alfa(colores.acc, 0));
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.283); ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, esSel ? 4.5 : 3, 0, 6.283);
        ctx.fillStyle = esSel ? colores.acc
          : alcanzado ? alfa(colores.acc, 0.75) : alfa(colores.t3, 0.8);
        ctx.fill();

        if (esCaido) {                       // el caído: tachado, honestamente muerto
          ctx.strokeStyle = colores.acc;
          ctx.lineWidth = 1.6;
          [-1, 1].forEach(function (sg) {
            ctx.beginPath();
            ctx.moveTo(x - 6, y - 6 * sg); ctx.lineTo(x + 6, y + 6 * sg);
            ctx.stroke();
          });
        }
        if (esHuerfano) {
          ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.283);
          ctx.strokeStyle = alfa(colores.acc, 0.7);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // etiquetas: anticolisión voraz — selección y huérfanos primero,
      // luego el frente, luego el resto; halo del fondo, no caja negra
      var ocupados = [];
      function choca(bx, by, bw, bh) {
        return ocupados.some(function (o) {
          return bx < o.x + o.w && bx + bw > o.x && by < o.y + o.h && by + bh > o.y;
        });
      }
      function prioridad(id) {
        if (seleccion.indexOf(id) >= 0) return 3;
        if (resuelto && huerfanos[id]) return 2;
        if (anilloDe[id] !== undefined) return 1;
        return 0;
      }
      var candidatos = datos.red.nodos.slice().sort(function (a, b) {
        return prioridad(b.id) - prioridad(a.id);
      });
      candidatos.forEach(function (n) {
        var q = p(n.id);
        if (!q) return;
        var x = q[0], y = q[1];
        if (x < -40 || x > w + 40 || y < -20 || y > h + 20) return;
        var esSel = seleccion.indexOf(n.id) >= 0;
        var txt = n.etiqueta.length > 16 ? n.etiqueta.slice(0, 15) + '…' : n.etiqueta;
        var ancho = ctx.measureText(txt).width;
        if (!esSel && choca(x - ancho / 2 - 2, y - 22, ancho + 4, 15)) return;
        ocupados.push({ x: x - ancho / 2 - 2, y: y - 22, w: ancho + 4, h: 15 });
        ctx.lineWidth = 3;
        ctx.strokeStyle = colores.fondo;
        ctx.strokeText(txt, x, y - 8);
        ctx.fillStyle = esSel ? colores.t1 : alfa(colores.t3, 0.9);
        ctx.fillText(txt, x, y - 8);
      });

      // brackets de esquina
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
      [[8, 8, 22, 8, 8, 22], [w - 8, 8, w - 22, 8, w - 8, 22],
       [8, h - 8, 22, h - 8, 8, h - 22], [w - 8, h - 8, w - 22, h - 8, w - 8, h - 22]]
        .forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[4], c[5]); ctx.stroke();
        });
      ctx.globalAlpha = 1; ctx.lineWidth = 1;

      return resuelto;
    }

    function animar() {
      if (animando) return;
      animando = true;
      inicio = performance.now();
      (function paso(ts) {
        var resuelto = dibujar(ts);
        if (!resuelto && !reduce) requestAnimationFrame(paso);
        else animando = false;
      })(performance.now());
    }

    // ── impacto en la ficha ──────────────────────────────────────────
    function barra(l, v) {
      return '<div class="qa-bar"><span class="l">' + esc(l) + '</span>' +
             '<span class="v">' + esc(v) + '</span></div>';
    }
    function pintarImpactoCaida(j, etiqueta) {
      elImpacto.innerHTML =
        barra('vínculos que caen', j.relaciones_caidas) +
        barra('islas', j.islas_antes + ' → ' + j.islas_despues) +
        barra('peso estructural', Math.round(j.peso_estructural * 100) + '%') +
        barra('pasos de onda', j.ondas.length);
      var html = '';
      (j.desconectados || []).forEach(function (d) {
        html += '<div class="qa-caja"><span title="' + esc(d.etiqueta) + '">◌ ' +
          esc(d.etiqueta.slice(0, 26)) + '</span></div>';
      });
      elHuerfanos.innerHTML = html ||
        '<p class="qa-base-hint">Nadie queda huérfano: la red aguanta la caída de «' +
        esc(etiqueta) + '».</p>';
    }
    function pintarImpactoEnlace(j) {
      elImpacto.innerHTML =
        barra('islas', j.islas_antes + ' → ' + j.islas_despues) +
        barra('fusiona islas', j.fusiona_islas ? 'sí' : 'no') +
        barra('saltos antes', j.saltos_antes === null ? '∞' : j.saltos_antes) +
        barra('se acercan', j.acercados);
      elHuerfanos.innerHTML = '<p class="qa-base-hint">' +
        (j.fusiona_islas
          ? 'El enlace une material que no conversaba. Materializarlo pasa por el plan aditivo.'
          : 'El enlace es un atajo dentro de la misma pieza.') + '</p>';
    }
    function limpiarImpacto(texto) {
      elImpacto.innerHTML = '';
      elHuerfanos.innerHTML = '<p class="qa-base-hint">' + esc(texto) + '</p>';
    }

    // ── simulación ───────────────────────────────────────────────────
    function etiquetaDe(id) {
      var n = datos.red.nodos.find(function (x) { return x.id === id; });
      return n ? n.etiqueta : id;
    }
    function simular() {
      var mia = ++reqSeq;
      var url = modo === 'caida'
        ? '/api/v1/autogenes/qualia/cascada?caida=' + encodeURIComponent(seleccion[0])
        : '/api/v1/autogenes/qualia/cascada?enlaza=' +
          encodeURIComponent(seleccion[0]) + ',' + encodeURIComponent(seleccion[1]);
      elInfo.textContent = 'SIMULANDO…';
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (mia !== reqSeq) return;
          if (!j || j.error) {
            elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase();
            return;
          }
          ondas = j.ondas || [];
          anilloDe = {};
          ondas.forEach(function (anillo, k) {
            anillo.forEach(function (id) { anilloDe[id] = k; });
          });
          huerfanos = {};
          caido = null;
          if (modo === 'caida') {
            caido = seleccion[0];
            (j.desconectados || []).forEach(function (d) { huerfanos[d.id] = true; });
            pintarImpactoCaida(j, etiquetaDe(seleccion[0]));
            elInfo.textContent = 'SI CAE «' + etiquetaDe(seleccion[0]).slice(0, 22).toUpperCase() +
              '»: ' + j.relaciones_caidas + ' VÍNCULOS MUEREN · ISLAS ' +
              j.islas_antes + ' → ' + j.islas_despues;
          } else {
            pintarImpactoEnlace(j);
            elInfo.textContent = 'ENLACE SIMULADO: ' +
              (j.fusiona_islas ? 'FUSIONA ISLAS ' : 'ATAJO ') +
              j.islas_antes + ' → ' + j.islas_despues + ' · ' +
              j.acercados + ' NODOS SE ACERCAN';
          }
          btnLimpiar.disabled = false;
          animar();
        })
        .catch(function () {
          if (mia !== reqSeq) return;
          elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
        });
    }
    function reiniciar(mensajeInfo) {
      seleccion = [];
      ondas = []; anilloDe = {}; huerfanos = {}; caido = null;
      btnLimpiar.disabled = true;
      limpiarImpacto(modo === 'caida'
        ? 'Toca un nodo para simular su caída.'
        : 'Toca DOS nodos para simular el vínculo entre ellos.');
      if (mensajeInfo) elInfo.textContent = mensajeInfo;
      dibujar();
    }

    // ── datos y gestos ───────────────────────────────────────────────
    function cargar() {
      fetch('/api/v1/autogenes/qualia/red?espectral=1')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) {
            elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase();
            return;
          }
          datos = j;
          reiniciar(datos.red.nodos.length + ' NODOS · ' +
                    datos.red.enlaces.length + ' FIBRAS · TOCA UN NODO');
        })
        .catch(function () {
          elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
        });
    }

    var arrastre = { activo: false, movido: false, x: 0, y: 0 };
    canvas.addEventListener('pointerdown', function (ev) {
      canvas.setPointerCapture(ev.pointerId);
      arrastre.activo = true; arrastre.movido = false;
      arrastre.x = ev.clientX; arrastre.y = ev.clientY;
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!arrastre.activo) return;
      var dx = ev.clientX - arrastre.x, dy = ev.clientY - arrastre.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movido = true;
      if (arrastre.movido) {
        vista.x += dx; vista.y += dy;
        arrastre.x = ev.clientX; arrastre.y = ev.clientY;
        if (!animando) dibujar();
      }
    });
    canvas.addEventListener('pointerup', function (ev) {
      var fueTap = arrastre.activo && !arrastre.movido;
      arrastre.activo = false;
      if (!fueTap || !datos) return;
      var caja = canvas.getBoundingClientRect();
      var sx = ev.clientX - caja.left, sy = ev.clientY - caja.top;
      var mejor = null, mejorD = 26 * 26;
      posPantalla.forEach(function (q) {
        var d = (q.x - sx) * (q.x - sx) + (q.y - sy) * (q.y - sy);
        if (d < mejorD) { mejorD = d; mejor = q.id; }
      });
      if (!mejor) { reiniciar(); return; }
      if (modo === 'caida') {
        seleccion = [mejor];
        simular();
      } else {
        if (seleccion.length >= 2) seleccion = [];
        seleccion.push(mejor);
        if (seleccion.length === 2) {
          if (seleccion[0] === seleccion[1]) { seleccion = [mejor]; dibujar(); return; }
          simular();
        } else {
          elInfo.textContent = 'ORIGEN: «' + etiquetaDe(mejor).slice(0, 22).toUpperCase() +
            '» · TOCA EL SEGUNDO NODO';
          dibujar();
        }
      }
    });
    canvas.addEventListener('pointercancel', function () { arrastre.activo = false; });
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      vista.k = Math.min(6, Math.max(0.4, vista.k * Math.pow(1.0015, -ev.deltaY)));
      if (!animando) dibujar();
    }, { passive: false });

    elModo.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        modo = b.getAttribute('data-modo');
        elModo.querySelectorAll('button').forEach(function (x) { x.className = ''; });
        b.className = 'activo';
        elHint.textContent = modo === 'caida'
          ? 'Modo caída: toca un nodo y el pulso recorre lo que depende de él. ' +
            'Nada se escribe — es simulación en memoria de tu propia red.'
          : 'Modo enlace: toca DOS nodos; el vínculo simulado pulsa primero y el ' +
            'impacto se mide. Materializarlo pasa por el plan aditivo.';
        reiniciar(modo === 'caida' ? 'TOCA UN NODO PARA SIMULAR SU CAÍDA'
                                   : 'TOCA DOS NODOS PARA SIMULAR EL VÍNCULO');
      });
    });
    btnLimpiar.addEventListener('click', function () {
      reiniciar('SIMULACIÓN LIMPIA · TOCA UN NODO');
      elMsj.textContent = '';
    });

    leerColores();
    tamano();
    window.addEventListener('resize', function () { tamano(); if (!animando) dibujar(); });
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); if (!animando) dibujar(); }, 60);
    });
    cargar();
  });
})();
