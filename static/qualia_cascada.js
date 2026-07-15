/* GNOSIS · Qualia — Cascada de bifurcación (Q3: retoque radial).
   El what-if como mapa de dependencia radial: la entidad bajo examen va
   al CENTRO y todo lo demás se coloca por profundidad de dependencia
   (radio = frente BFS del motor de cascada, determinista; el ángulo
   reparte el sub-árbol). Las arterias irradian como un plano de ciudad;
   un andamiaje de anillos y radios da el tejido de radar; el mapa flota
   en la oscuridad con glow de wireframe. Elegir un nodo lo pone al
   centro, lanza la onda de choque por el frente BFS REAL y mide el
   impacto: qué vínculos caen, cuántas islas, qué queda huérfano. El
   pulso corre UNA vez y se resuelve estático; prefers-reduced-motion
   arranca ahí. Cian (--acc): inteligencia viva, no alerta — el magenta
   queda al Terreno. Nada escribe. Datos: /qualia/red y /qualia/cascada. */
(function () {
  'use strict';

  var Q = window.QualiaComun;
  var MS_POR_PASO = 420;

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qc-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.setAttribute('role', 'img');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    var elModo = document.getElementById('qc-modo');
    var elInfo = document.getElementById('qc-info');
    var elHint = document.getElementById('qc-hint');
    var elImpacto = document.getElementById('qc-impacto');
    var elHuerfanos = document.getElementById('qc-huerfanos');
    var btnLimpiar = document.getElementById('qc-limpiar');
    var elMsj = document.getElementById('qc-msj');

    var C = {};
    var datos = null;            // /qualia/red (lente de negocio)
    var ady = {};                // adyacencia
    var modo = 'caida';
    var seleccion = [];          // 1 id (caída) o 2 ids (enlace)
    var centro = null;           // nodo al centro del layout radial
    var caido = null;            // nodo simulado como caído
    var huerfanos = {};          // desconectados del motor
    var ring = {}, ang = {}, maxRing = 1;
    var pos = {};                // id -> [nx, ny] normalizado
    var inicio = 0, animando = false;
    var vista = { x: 0, y: 0, k: 1 };
    var posPantalla = [];
    var reqSeq = 0;

    // radio normalizado por anillo: el 0 al centro, el 1 empujado afuera
    // para que el primer anillo respire (evita el racimo interior).
    function radioAnillo(k) {
      if (k <= 0) return 0;
      if (k > maxRing) return 1.12;             // islas ajenas: borde
      return 0.34 + 0.66 * (k - 1) / Math.max(1, maxRing - 1);
    }

    // ── layout radial: BFS desde `c`, sectores por tamaño de sub-árbol ──
    function layout(c) {
      ring = {}; ang = {};
      var parent = {}, orden = [], kids = {};
      ring[c] = 0; parent[c] = null;
      var q = [c];
      while (q.length) {
        var u = q.shift(); orden.push(u); kids[u] = kids[u] || [];
        (ady[u] || []).forEach(function (v) {
          if (ring[v] === undefined) { ring[v] = ring[u] + 1; parent[v] = u; q.push(v); }
        });
      }
      // nodos inalcanzables (otras islas): anillo exterior, repartidos
      var sueltos = datos.red.nodos.filter(function (n) { return ring[n.id] === undefined; });
      orden.forEach(function (u) { if (parent[u] != null) (kids[parent[u]] = kids[parent[u]] || []).push(u); });
      maxRing = Math.max(1, Math.max.apply(null, Object.keys(ring).map(function (k) { return ring[k]; })));
      var hojas = {};
      for (var i = orden.length - 1; i >= 0; i--) {
        var u2 = orden[i], ks = kids[u2] || [];
        hojas[u2] = ks.length ? ks.reduce(function (s, x) { return s + hojas[x]; }, 0) : 1;
      }
      var lo = {}, hi = {};
      lo[c] = 0; hi[c] = 2 * Math.PI; ang[c] = 0;
      orden.forEach(function (u) {
        var ks = kids[u] || []; if (!ks.length) return;
        var tot = ks.reduce(function (s, x) { return s + hojas[x]; }, 0), cur = lo[u];
        ks.forEach(function (x) {
          var span = (hi[u] - lo[u]) * hojas[x] / tot;
          lo[x] = cur; hi[x] = cur + span; ang[x] = cur + span / 2; cur += span;
        });
      });
      pos = {};
      datos.red.nodos.forEach(function (n) {
        var rr = ring[n.id] === undefined ? 0 : radioAnillo(ring[n.id]);
        pos[n.id] = [Math.cos(ang[n.id] || 0) * rr, Math.sin(ang[n.id] || 0) * rr];
      });
      sueltos.forEach(function (n, k) {          // islas ajenas: borde inferior
        var a = Math.PI * (0.5 + 0.5 * (k + 1) / (sueltos.length + 1));
        pos[n.id] = [Math.cos(a) * 1.12, Math.sin(a) * 1.12];
        ring[n.id] = maxRing + 1;
      });
    }

    function dibujar(ts) {
      if (!datos) return;
      var d = Q.medir(canvas, ctx, 420);
      var w = d.w, h = d.h, cx = w / 2 + vista.x, cy = h / 2 + vista.y;
      var R = Math.min(w, h) * 0.44 * vista.k;
      var pasoMax = maxRing + 0.5;
      var paso = (reduce || !caido) ? pasoMax
        : Math.min(pasoMax, ((ts || performance.now()) - inicio) / MS_POR_PASO);
      var resuelto = paso >= pasoMax;
      ctx.clearRect(0, 0, w, h);
      var p = function (id) {
        var q = pos[id]; if (!q) return null;
        return [w / 2 + q[0] * R + vista.x, h / 2 + q[1] * R + vista.y];
      };

      // viñeta: el mapa flota en la oscuridad
      var vin = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.3);
      vin.addColorStop(0, Q.alfa(C.acc, 0.05)); vin.addColorStop(1, Q.alfa(C.acc, 0));
      ctx.fillStyle = vin; ctx.fillRect(0, 0, w, h);

      // andamiaje de ciudad radial (GRID, no vínculos): radios + anillos
      ctx.save(); ctx.setLineDash([2, 5]);
      for (var sp = 0; sp < 24; sp++) {
        var aa = sp / 24 * 6.283;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aa) * R * 1.12, cy + Math.sin(aa) * R * 1.12);
        ctx.strokeStyle = Q.alfa(C.linea, 0.05); ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.setLineDash([]);
      for (var rr = 1; rr <= maxRing; rr++) {
        ctx.beginPath(); ctx.arc(cx, cy, radioAnillo(rr) * R, 0, 6.283);
        ctx.strokeStyle = Q.alfa(C.linea, 0.06); ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();

      // ondas de choque desde el centro/caído (animadas)
      var fc = caido ? p(caido) : [cx, cy];
      if (fc) {
        ctx.lineCap = 'round';
        for (var r = 1; r <= maxRing; r++) {
          var visible = resuelto || paso >= r - 0.5;
          if (!visible) continue;
          var frescura = resuelto ? 1 : Math.max(0.3, 1 - (paso - r));
          ctx.beginPath(); ctx.arc(fc[0], fc[1], radioAnillo(r) * R, 0, 6.283);
          ctx.strokeStyle = Q.alfa(C.acc, 0.13 * (1 - r / (maxRing + 1)) * frescura);
          ctx.shadowColor = C.acc; ctx.shadowBlur = 12; ctx.lineWidth = 1.6; ctx.stroke();
        }
        ctx.shadowBlur = 0; ctx.lineCap = 'butt';
      }

      // arterias: rieles wireframe; muertas si tocan el caído o van al huérfano
      datos.red.enlaces.forEach(function (e) {
        var a = p(e.origen), b = p(e.destino); if (!a || !b) return;
        var muerta = caido !== null && (e.origen === caido || e.destino === caido);
        var haciaOrf = resuelto && (huerfanos[e.origen] || huerfanos[e.destino]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = Q.alfa(C.linea, (muerta && resuelto) ? 0.05 : 0.14); ctx.lineWidth = 1; ctx.stroke();
        if (!muerta && !haciaOrf) {
          var ka = ring[e.origen], kb = ring[e.destino];
          if (ka !== undefined && kb !== undefined) {
            var kk = Math.max(ka, kb);
            var brillo = resuelto ? 0.55 * (1 - kk / (maxRing + 1))
              : Math.max(0, 1 - Math.abs(paso - kk)) * 0.7;
            if (brillo > 0.02) {
              ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
              ctx.strokeStyle = Q.alfa(C.acc, Math.max(0.1, brillo));
              ctx.shadowColor = C.acc; ctx.shadowBlur = 7; ctx.lineWidth = 1.6; ctx.stroke();
              ctx.shadowBlur = 0;
            }
          }
        }
      });

      // el enlace simulado (modo enlace): fibra viva punteada
      if (modo === 'enlace' && seleccion.length === 2) {
        var a2 = p(seleccion[0]), b2 = p(seleccion[1]);
        if (a2 && b2) {
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]);
          ctx.strokeStyle = Q.alfa(C.acc, 0.9); ctx.shadowColor = C.acc; ctx.shadowBlur = 8;
          ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
        }
      }

      // nodos
      posPantalla = [];
      datos.red.nodos.forEach(function (n) {
        var q = p(n.id); if (!q) return;
        var x = q[0], y = q[1], k = ring[n.id];
        posPantalla.push({ x: x, y: y, id: n.id });
        var esCaido = caido === n.id, orf = resuelto && huerfanos[n.id];
        var esSel = seleccion.indexOf(n.id) >= 0;
        var alcanzado = k !== undefined && paso >= k;
        if (!esCaido) {
          var br = orf ? 0.16 : (alcanzado ? 0.6 * (1 - (k || 0) / (maxRing + 1)) + 0.12 : 0.15);
          var g = ctx.createRadialGradient(x, y, 0, x, y, 13);
          g.addColorStop(0, Q.alfa(orf ? C.t3 : C.acc, (orf ? 0.3 : 0.55) * br + 0.08));
          g.addColorStop(1, Q.alfa(C.acc, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.283); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(x, y, esCaido ? 5 : esSel ? 4.5 : 3.2, 0, 6.283);
        ctx.fillStyle = esCaido ? C.t1 : esSel ? C.acc
          : orf ? Q.alfa(C.t3, 0.7) : alcanzado ? Q.alfa(C.acc, 0.9) : Q.alfa(C.t3, 0.8);
        if (!esCaido && alcanzado && !orf) { ctx.shadowColor = C.acc; ctx.shadowBlur = 6 * (1 - (k || 0) / (maxRing + 1)); }
        ctx.fill(); ctx.shadowBlur = 0;
        if (esCaido) {
          var gg = ctx.createRadialGradient(x, y, 0, x, y, 26);
          gg.addColorStop(0, Q.alfa(C.acc, 0.55)); gg.addColorStop(1, Q.alfa(C.acc, 0));
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 26, 0, 6.283); ctx.fill();
          ctx.strokeStyle = C.acc; ctx.lineWidth = 2; ctx.shadowColor = C.acc; ctx.shadowBlur = 9;
          [-1, 1].forEach(function (sg) {
            ctx.beginPath(); ctx.moveTo(x - 7, y - 7 * sg); ctx.lineTo(x + 7, y + 7 * sg); ctx.stroke();
          });
          ctx.shadowBlur = 0;
        }
        if (orf) {
          ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283);
          ctx.strokeStyle = Q.alfa(C.acc, 0.6); ctx.lineWidth = 1; ctx.stroke();
        }
      });

      // etiquetas con anti-colisión voraz: caído y selección SIEMPRE; luego
      // huérfanos y hubs si caben. La lista completa vive en el panel, así
      // que en el lienzo prima la legibilidad sobre la exhaustividad.
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      var ocupados = [];
      function choca(bx, by, bw, bh) {
        return ocupados.some(function (o) {
          return bx < o.x + o.w && bx + bw > o.x && by < o.y + o.h && by + bh > o.y;
        });
      }
      function prioridad(id) {
        if (caido === id) return 4;
        if (seleccion.indexOf(id) >= 0) return 3;
        if (resuelto && huerfanos[id]) return 2;
        if (ring[id] !== undefined && (ady[id] || []).length >= 3) return 1;
        return 0;
      }
      datos.red.nodos.slice().filter(function (n) { return prioridad(n.id) > 0; })
        .sort(function (a, b) { return prioridad(b.id) - prioridad(a.id); })
        .forEach(function (n) {
          var q = p(n.id); if (!q) return;
          var x = q[0], y = q[1];
          if (x < -40 || x > w + 40 || y < 0 || y > h) return;
          var txt = n.etiqueta.length > 18 ? n.etiqueta.slice(0, 17) + '…' : n.etiqueta;
          var aw = ctx.measureText(txt).width;
          var forzar = caido === n.id || seleccion.indexOf(n.id) >= 0;
          if (!forzar && choca(x - aw / 2 - 2, y - 22, aw + 4, 15)) return;
          ocupados.push({ x: x - aw / 2 - 2, y: y - 22, w: aw + 4, h: 15 });
          ctx.lineWidth = 3; ctx.strokeStyle = C.fondo; ctx.strokeText(txt, x, y - 9);
          ctx.fillStyle = caido === n.id ? C.t1
            : (resuelto && huerfanos[n.id]) ? Q.alfa(C.t3, 0.95) : Q.alfa(C.acc, 0.95);
          ctx.fillText(txt, x, y - 9);
        });

      Q.brackets(ctx, w, h, C.acc);
      return resuelto;
    }

    function animar() {
      if (animando) return;
      animando = true; inicio = performance.now();
      (function paso(ts) {
        var r = dibujar(ts);
        if (!r && !reduce) requestAnimationFrame(paso); else animando = false;
      })(performance.now());
    }

    // ── impacto ──────────────────────────────────────────────────────
    function barra(l, v) {
      return '<div class="qa-bar"><span class="l">' + Q.esc(l) + '</span>' +
             '<span class="v">' + Q.esc(v) + '</span></div>';
    }
    function pintarImpactoCaida(j, etiqueta) {
      elImpacto.innerHTML =
        barra('vínculos que caen', j.relaciones_caidas) +
        barra('islas', j.islas_antes + ' → ' + j.islas_despues) +
        barra('unidades desconectadas', j.volumen_afectado || 0) +
        barra('peso en el tejido', Math.round(j.peso_estructural * 100) + '%') +
        barra('pasos de onda', j.ondas.length);
      var html = '';
      (j.desconectados || []).forEach(function (v) {
        var u = v.unidades ? ' <b>· ' + v.unidades + ' u</b>' : '';
        html += '<div class="qa-caja"><span title="' + Q.esc(v.etiqueta) + '">◌ ' +
          Q.esc(v.etiqueta.slice(0, 26)) + u + '</span></div>';
      });
      elHuerfanos.innerHTML = html ||
        '<p class="qa-base-hint">Nadie queda huérfano: la red aguanta la caída de «' +
        Q.esc(etiqueta) + '».</p>';
    }
    function pintarImpactoEnlace(j) {
      elImpacto.innerHTML =
        barra('islas', j.islas_antes + ' → ' + j.islas_despues) +
        barra('fusiona islas', j.fusiona_islas ? 'sí' : 'no') +
        barra('ruta antes', j.saltos_antes === null ? 'no había' : j.saltos_antes) +
        barra('se acercan', j.acercados);
      elHuerfanos.innerHTML = '<p class="qa-base-hint">' +
        (j.fusiona_islas
          ? 'El vínculo une material que no conversaba. Materializarlo pasa por el plan aditivo.'
          : 'El vínculo es un atajo dentro de la misma pieza.') + '</p>';
    }
    function limpiarImpacto(texto) {
      elImpacto.innerHTML = '';
      elHuerfanos.innerHTML = '<p class="qa-base-hint">' + Q.esc(texto) + '</p>';
    }

    // ── simulación ───────────────────────────────────────────────────
    function etiquetaDe(id) {
      var n = datos.red.nodos.find(function (x) { return x.id === id; });
      return n ? n.etiqueta : id;
    }
    function centroPorGrado() {
      var mejor = null, mejorG = -1;
      datos.red.nodos.forEach(function (n) {
        var g = (ady[n.id] || []).length;
        if (g > mejorG) { mejorG = g; mejor = n.id; }
      });
      return mejor;
    }
    function simular() {
      var mia = ++reqSeq;
      var url = modo === 'caida'
        ? '/api/v1/autogenes/qualia/cascada?caida=' + encodeURIComponent(seleccion[0])
        : '/api/v1/autogenes/qualia/cascada?enlaza=' +
          encodeURIComponent(seleccion[0]) + ',' + encodeURIComponent(seleccion[1]);
      elInfo.textContent = 'SIMULANDO…';
      fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        if (mia !== reqSeq) return;
        if (!j || j.error) { elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase(); return; }
        huerfanos = {};
        if (modo === 'caida') {
          caido = seleccion[0];
          centro = caido; layout(centro);          // re-centra en el caído
          (j.desconectados || []).forEach(function (v) { huerfanos[v.id] = true; });
          pintarImpactoCaida(j, etiquetaDe(seleccion[0]));
          elInfo.textContent = 'SI CAE «' + etiquetaDe(seleccion[0]).slice(0, 22).toUpperCase() +
            '»: ' + j.relaciones_caidas + ' VÍNCULOS MUEREN · ISLAS ' +
            j.islas_antes + ' → ' + j.islas_despues;
        } else {
          caido = null;
          pintarImpactoEnlace(j);
          elInfo.textContent = 'VÍNCULO SIMULADO: ' + (j.fusiona_islas ? 'FUSIONA ISLAS ' : 'ATAJO ') +
            j.islas_antes + ' → ' + j.islas_despues + ' · ' + j.acercados + ' SE ACERCAN';
        }
        btnLimpiar.disabled = false;
        animar();
      }).catch(function () { if (mia === reqSeq) elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }
    function reposo(mensajeInfo) {
      seleccion = []; caido = null; huerfanos = {};
      centro = centroPorGrado(); layout(centro);
      btnLimpiar.disabled = true;
      limpiarImpacto(modo === 'caida'
        ? 'Toca una entidad para simular su caída — el sistema la pone al centro.'
        : 'Toca DOS entidades para simular el vínculo entre ellas.');
      if (mensajeInfo) elInfo.textContent = mensajeInfo;
      dibujar();
    }

    function cargar() {
      fetch('/api/v1/autogenes/qualia/red').then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.error) { elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase(); return; }
        datos = j;
        ady = {};
        datos.red.nodos.forEach(function (n) { ady[n.id] = []; });
        datos.red.enlaces.forEach(function (e) {
          if (ady[e.origen]) ady[e.origen].push(e.destino);
          if (ady[e.destino]) ady[e.destino].push(e.origen);
        });
        canvas.setAttribute('aria-label',
          'Cascada de bifurcación: mapa radial de dependencia de ' + datos.red.nodos.length +
          ' entidades. Toca una entidad para simular su caída; el impacto se lista a la derecha.');
        reposo(datos.red.nodos.length + ' ENTIDADES · ' + datos.red.enlaces.length +
               ' VÍNCULOS · TOCA UNA ENTIDAD');
      }).catch(function () { elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }

    // ── gestos ───────────────────────────────────────────────────────
    function nodoEn(ev) {
      var caja = canvas.getBoundingClientRect();
      var sx = ev.clientX - caja.left, sy = ev.clientY - caja.top;
      var mejor = null, mejorD = 26 * 26;
      posPantalla.forEach(function (q) {
        var dd = (q.x - sx) * (q.x - sx) + (q.y - sy) * (q.y - sy);
        if (dd < mejorD) { mejorD = dd; mejor = q.id; }
      });
      return mejor;
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
      var mejor = nodoEn(ev);
      if (!mejor) { reposo(); return; }
      if (modo === 'caida') { seleccion = [mejor]; simular(); }
      else {
        if (seleccion.length >= 2) seleccion = [];
        seleccion.push(mejor);
        if (seleccion.length === 2) {
          if (seleccion[0] === seleccion[1]) { seleccion = [mejor]; dibujar(); return; }
          simular();
        } else {
          elInfo.textContent = 'ORIGEN: «' + etiquetaDe(mejor).slice(0, 22).toUpperCase() + '» · TOCA EL SEGUNDO';
          dibujar();
        }
      }
    });
    canvas.addEventListener('pointercancel', function () { arrastre.activo = false; });
    // gesto secundario: doble clic abre el dossier de la entidad (el clic
    // simple sigue simulando la caída — no se pisa el what-if) (Q4)
    canvas.addEventListener('dblclick', function (ev) {
      if (!datos) return;
      var id = nodoEn(ev);
      if (id && window.QualiaDossier) {
        window.QualiaDossier.abrir(etiquetaDe(id), { nodoId: id });
      }
    });
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
          ? 'Modo caída: toca una entidad; el sistema la pone al centro y la onda ' +
            'recorre lo que depende de ella. Nada se escribe — simulación en memoria.'
          : 'Modo enlace: toca DOS entidades; el vínculo simulado se mide. ' +
            'Materializarlo pasa por el plan aditivo.';
        reposo(modo === 'caida' ? 'TOCA UNA ENTIDAD PARA SIMULAR SU CAÍDA'
                                : 'TOCA DOS ENTIDADES PARA SIMULAR EL VÍNCULO');
      });
    });
    btnLimpiar.addEventListener('click', function () {
      reposo('SIMULACIÓN LIMPIA · TOCA UNA ENTIDAD');
      if (elMsj) elMsj.textContent = '';
    });

    C = Q.leerColores();
    window.addEventListener('resize', function () { if (!animando) dibujar(); });
    Q.alTema(function () { C = Q.leerColores(); if (!animando) dibujar(); });
    cargar();
  });
})();
