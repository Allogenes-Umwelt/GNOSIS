/* GNOSIS · Qualia — Red del caso (F7d, dirección databook aprobada).
   El lienzo pinta la red del nivel elegido de la escalera de agrupamiento
   como un sistema cósmico: cada comunidad orbita un núcleo luminoso —el
   pozo de gravedad del caso— con su concentrador radiante al centro y sus
   miembros en espiral de ángulo áureo. El hairball se resuelve fundiendo
   los vínculos inter-comunidad en tendones que fluyen POR el núcleo (Σ de
   pesos por par), no en espagueti; es el mismo agregado que colapsa el
   siguiente peldaño, así que lo visual ES la topología. El inset muestra
   ese peldaño agrupado; tócalo para promoverlo. Pasar el cursor por un
   concentrador aísla su comunidad; un clic la fija. La ficha derecha es
   salida del motor: lectura determinista, spec, concentradores, puentes y
   anomalías medidas contra la base del operador. Trazos con la variante
   AAA por modo (--acc-text); magenta solo en anomalías reales.
   Determinista; el lienzo es estático — no hay animación que congelar.
   Datos: /api/v1/autogenes/qualia/red y /qualia/estado. */
(function () {
  'use strict';
  var Q = window.QualiaComun;
  var GOLDEN = Math.PI * (3 - Math.sqrt(5));

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qa-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas || !Q) return;
    var ctx = canvas.getContext('2d');

    var elDial = document.getElementById('qa-dial');
    var elInfo = document.getElementById('qa-info');
    var elLectura = document.getElementById('qa-lectura');
    var elSpec = document.getElementById('qa-spec');
    var elHubs = document.getElementById('qa-hubs');
    var elPuentes = document.getElementById('qa-puentes');
    var elAnom = document.getElementById('qa-anomalias');
    var btnBase = document.getElementById('qa-base');
    var elMsj = document.getElementById('qa-msj');

    var C = {};                 // colores por tema
    var niveles = null;         // conteo de nodos por peldaño
    var cache = {};             // nivel -> respuesta de /qualia/red
    var nivel = 0;
    var reqSeq = 0;
    var insetBox = null;        // caja del inset (promoción por clic)
    var hubsHit = [];           // [{x, y, r, com}] para hover/clic
    var comSel = null;          // comunidad bajo el cursor
    var comFija = null;         // comunidad fijada por clic

    // ── derivación: comunidades, concentrador y tendones agregados ────
    function construir(d) {
      if (d._c) return d._c;
      var porCom = {};
      d.red.nodos.forEach(function (n) {
        var c = d.comunidad[n.id];
        (porCom[c] = porCom[c] || []).push(n);
      });
      var puentes = {};
      d.resumen.puentes.forEach(function (p) { puentes[p.id] = true; });
      var coms = Object.keys(porCom).map(function (c) {
        var lista = porCom[c].slice().sort(function (a, b) {
          return (d.grado[b.id] || 0) - (d.grado[a.id] || 0)
            || (a.id < b.id ? -1 : 1);
        });
        var hub = lista[0];
        return { c: c, hub: hub, miembros: lista.slice(1), size: lista.length,
                 etiqueta: hub ? hub.etiqueta : c };
      }).sort(function (a, b) { return b.size - a.size || (a.c < b.c ? -1 : 1); });
      // pesos inter-comunidad fundidos por par (Σ) — el tendón del núcleo
      var interW = {}, wMax = 1;
      d.red.enlaces.forEach(function (e) {
        var ca = d.comunidad[e.origen], cb = d.comunidad[e.destino];
        if (ca === undefined || cb === undefined || ca === cb) return;
        var k = ca < cb ? ca + '|' + cb : cb + '|' + ca;
        interW[k] = (interW[k] || 0) + (e.peso || 0.5);
        if (interW[k] > wMax) wMax = interW[k];
      });
      d._c = { coms: coms, puentes: puentes, interW: interW, wMax: wMax };
      return d._c;
    }

    // ── layout: comunidades en anillo, miembros en espiral áurea ──────
    function layout(d, w, h) {
      var e = construir(d);
      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
      var N = e.coms.length, centros = {}, pos = {};
      e.coms.forEach(function (g, i) {
        var a = N === 1 ? -Math.PI / 2 : (i / N) * 6.283 - Math.PI / 2;
        var gx = N === 1 ? cx : cx + Math.cos(a) * R;
        var gy = N === 1 ? cy : cy + Math.sin(a) * R;
        centros[g.c] = { x: gx, y: gy, size: g.size };
        pos[g.hub.id] = { x: gx, y: gy, hub: true, com: g.c };
        g.miembros.forEach(function (n, k) {
          var rr = 12 + 6.5 * Math.sqrt(k + 1), aa = k * GOLDEN + a;
          pos[n.id] = { x: gx + Math.cos(aa) * rr, y: gy + Math.sin(aa) * rr,
                        hub: false, com: g.c };
        });
      });
      // auto-contén sin romper la geometría de núcleo (escala hacia el centro)
      var maxD = 1;
      Object.keys(pos).forEach(function (id) {
        var p = pos[id], dd = Math.hypot(p.x - cx, p.y - cy);
        if (dd > maxD) maxD = dd;
      });
      var lim = Math.min(w, h) * 0.46;
      if (maxD > lim) {
        var s = lim / maxD;
        Object.keys(pos).forEach(function (id) {
          var p = pos[id]; p.x = cx + (p.x - cx) * s; p.y = cy + (p.y - cy) * s;
        });
        Object.keys(centros).forEach(function (c) {
          var p = centros[c]; p.x = cx + (p.x - cx) * s; p.y = cy + (p.y - cy) * s;
        });
      }
      return { pos: pos, centros: centros, cx: cx, cy: cy };
    }

    function viva(com) { var sel = comFija || comSel; return !sel || sel === com; }

    function dibujar() {
      var d = cache[nivel];
      if (!d) return;
      var s = Q.medir(canvas, ctx, 460), w = s.w, h = s.h;
      var e = construir(d);
      var L = layout(d, w, h), cx = L.cx, cy = L.cy, pos = L.pos, centros = L.centros;
      ctx.clearRect(0, 0, w, h);

      // fondo cósmico: viñeta + campo de polvo determinista (LCG, sin azar)
      var vg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(w, h) * 0.62);
      vg.addColorStop(0, Q.alfa(C.acc, 0.06)); vg.addColorStop(1, Q.alfa(C.acc, 0));
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      var sd = 20260701 + nivel * 7919;
      function rnd() { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; }
      for (var i = 0; i < 120; i++) {
        var dx = rnd() * w, dy = rnd() * h, br = rnd();
        ctx.beginPath(); ctx.arc(dx, dy, br < 0.88 ? 0.6 : 1.1, 0, 6.283);
        ctx.fillStyle = Q.alfa(C.t3, 0.04 + 0.09 * br); ctx.fill();
      }

      // núcleo del caso: pozo de gravedad luminoso
      var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.16);
      core.addColorStop(0, Q.alfa(C.acc, 0.22)); core.addColorStop(0.5, Q.alfa(C.acc, 0.06));
      core.addColorStop(1, Q.alfa(C.acc, 0));
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * 0.16, 0, 6.283); ctx.fill();

      // vínculos intra-comunidad: locales y tenues
      e.coms.forEach(function (g) {
        var gc = centros[g.c], f = viva(g.c) ? 1 : 0.25;
        g.miembros.forEach(function (n) {
          var p = pos[n.id]; if (!p) return;
          ctx.beginPath(); ctx.moveTo(gc.x, gc.y); ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = Q.alfa(C.acc, 0.13 * f); ctx.lineWidth = 1; ctx.stroke();
        });
      });

      // vínculos inter-comunidad: tendones agrupados que fluyen por el núcleo
      Object.keys(e.interW).forEach(function (k) {
        var par = k.split('|'), a = centros[par[0]], b = centros[par[1]];
        if (!a || !b) return;
        var f = (viva(par[0]) && viva(par[1])) ? 1 : 0.18;
        var c1x = a.x + (cx - a.x) * 0.72, c1y = a.y + (cy - a.y) * 0.72;
        var c2x = b.x + (cx - b.x) * 0.72, c2y = b.y + (cy - b.y) * 0.72;
        ctx.beginPath(); ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, b.x, b.y);
        ctx.strokeStyle = Q.alfa(C.acc, 0.5 * f); ctx.shadowColor = C.acc;
        ctx.shadowBlur = 8 * f;
        ctx.lineWidth = 1 + 3.4 * Math.sqrt(e.interW[k] / e.wMax); ctx.stroke();
      });
      ctx.shadowBlur = 0;

      // nodos miembro: brillo por centralidad
      e.coms.forEach(function (g) {
        var f = viva(g.c) ? 1 : 0.22;
        g.miembros.forEach(function (n) {
          var p = pos[n.id]; if (!p) return;
          var r = 2 + 3.4 * Math.sqrt(d.masas[n.id] || 0);
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283);
          ctx.fillStyle = Q.alfa(C.acc, 0.6 * f); ctx.shadowColor = C.acc;
          ctx.shadowBlur = 3 * f; ctx.fill();
        });
      });
      ctx.shadowBlur = 0;

      // baricentro del caso
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 6.283);
      ctx.fillStyle = Q.alfa(C.t1, 0.7); ctx.shadowColor = C.acc; ctx.shadowBlur = 10;
      ctx.fill(); ctx.shadowBlur = 0;

      // concentradores radiantes con etiqueta de negocio
      hubsHit = [];
      e.coms.forEach(function (g) {
        var gc = centros[g.c], f = viva(g.c) ? 1 : 0.28;
        var rad = 5 + Math.min(16, g.size * 0.7);
        var gl = ctx.createRadialGradient(gc.x, gc.y, 0, gc.x, gc.y, rad * 2.4);
        gl.addColorStop(0, Q.alfa(C.acc, 0.5 * f)); gl.addColorStop(1, Q.alfa(C.acc, 0));
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(gc.x, gc.y, rad * 2.4, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.arc(gc.x, gc.y, rad, 0, 6.283);
        ctx.fillStyle = Q.alfa(C.acc, f); ctx.shadowColor = C.acc; ctx.shadowBlur = 12 * f;
        ctx.fill(); ctx.shadowBlur = 0;
        if (e.puentes[g.hub.id]) {         // rombo: puente de articulación
          ctx.strokeStyle = Q.alfa(C.acc, f); ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(gc.x, gc.y - rad - 7); ctx.lineTo(gc.x + rad + 7, gc.y);
          ctx.lineTo(gc.x, gc.y + rad + 7); ctx.lineTo(gc.x - rad - 7, gc.y);
          ctx.closePath(); ctx.stroke();
        }
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        var txt = String(g.etiqueta).slice(0, 22);
        ctx.lineWidth = 3; ctx.strokeStyle = C.fondo;
        ctx.strokeText(txt, gc.x, gc.y - rad - 5);
        ctx.fillStyle = Q.alfa(C.t1, f); ctx.fillText(txt, gc.x, gc.y - rad - 5);
        hubsHit.push({ x: gc.x, y: gc.y, r: rad + 8, com: g.c,
                       id: g.hub.id, etiqueta: g.etiqueta });
      });
      ctx.textBaseline = 'alphabetic';

      pintarInset(w, h);
      Q.brackets(ctx, w, h, C.acc);
      pintarInfo(d);
    }

    // inset: el peldaño agrupado; el mismo colapso que computa el motor
    function pintarInset(w, h) {
      insetBox = null;
      var sig = cache[nivel + 1];
      if (!sig || !niveles || nivel + 1 >= niveles.length) return;
      var es = construir(sig);
      var iw = Math.min(w, h) * 0.28, ih = iw * 0.72;
      var ix = w - iw - 16, iy = h - ih - 16;
      insetBox = { x: ix, y: iy, w: iw, h: ih };
      ctx.fillStyle = Q.alfa(C.fondo, 0.85); ctx.fillRect(ix, iy, iw, ih);
      ctx.strokeStyle = Q.alfa(C.acc, 0.4); ctx.lineWidth = 1; ctx.strokeRect(ix, iy, iw, ih);
      var icx = ix + iw / 2, icy = iy + ih / 2 + 8, iR = Math.min(iw, ih) * 0.30;
      var N = es.coms.length, cen = {};
      es.coms.forEach(function (g, i) {
        var a = N === 1 ? -Math.PI / 2 : (i / N) * 6.283 - Math.PI / 2;
        cen[g.c] = { x: N === 1 ? icx : icx + Math.cos(a) * iR,
                     y: N === 1 ? icy : icy + Math.sin(a) * iR };
      });
      Object.keys(es.interW).forEach(function (k) {
        var par = k.split('|'), a = cen[par[0]], b = cen[par[1]]; if (!a || !b) return;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(icx, icy, b.x, b.y);
        ctx.strokeStyle = Q.alfa(C.acc, 0.35); ctx.lineWidth = 1; ctx.stroke();
      });
      es.coms.forEach(function (g) {
        var p = cen[g.c];
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 + Math.min(9, g.size * 0.35), 0, 6.283);
        ctx.fillStyle = C.acc; ctx.shadowColor = C.acc; ctx.shadowBlur = 5; ctx.fill();
      });
      ctx.shadowBlur = 0;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = Q.alfa(C.t3, 0.9);
      ctx.fillText('NIVEL DE AGRUPAMIENTO ×' + (nivel + 1) + ' · ' +
                   es.coms.length + ' GRUPOS ▸', ix + 8, iy + 7);
      ctx.textBaseline = 'alphabetic';
    }

    // ── ficha derecha (salida del motor) ──────────────────────────────
    function pintarInfo(d) {
      var r = d.resumen;
      elInfo.textContent = r.n_nodos + ' CONCEPTOS · ' + r.n_enlaces + ' VÍNCULOS · ' +
        r.n_comunidades + ' COMUNIDADES · ' +
        (nivel === 0 ? 'NIVEL DETALLE' : 'AGRUPADO ×' + nivel);
    }
    function pintarFicha(d) {
      var r = d.resumen;
      var spec = '';
      [['nodos', r.n_nodos], ['enlaces', r.n_enlaces],
       ['densidad', r.densidad.toFixed(4)], ['comunidades', r.n_comunidades],
       ['componentes', r.n_componentes], ['mayor comunidad', r.comunidad_mayor]]
        .forEach(function (kv) {
          spec += '<div class="qa-bar"><span class="l">' + kv[0] + '</span>' +
            '<span class="v">' + Q.esc(kv[1]) + '</span></div>';
        });
      elSpec.innerHTML = spec;
      var hubs = '';
      r.hubs.forEach(function (h) {
        hubs += '<div class="qa-caja"><span title="' + Q.esc(h.etiqueta) + '">' +
          Q.esc(h.etiqueta.slice(0, 24)) + '</span><b>×' + h.grado.toFixed(1) + '</b></div>';
      });
      elHubs.innerHTML = hubs || '<p class="qa-base-hint">Sin conexiones aún.</p>';
      var pts = '';
      r.puentes.forEach(function (p) {
        pts += '<div class="qa-caja puente"><span title="' + Q.esc(p.etiqueta) + '">◇ ' +
          Q.esc(p.etiqueta.slice(0, 24)) + '</span><b>' + p.grado.toFixed(1) + '</b></div>';
      });
      elPuentes.innerHTML = pts ||
        '<p class="qa-base-hint">Sin puentes — la red no depende de un solo nodo.</p>';
    }
    function pintarEstado(est) {
      var lect = '';
      (est.lectura || []).forEach(function (linea) {
        lect += '<p class="qa-lectura">' + Q.esc(linea) + '</p>';
      });
      elLectura.innerHTML = lect || '<p class="qa-base-hint">Sin red que leer.</p>';
      var anom = '';
      (est.hallazgos || []).forEach(function (h) {
        anom += '<div class="qa-caja anomalia"><span title="' + Q.esc(h.detalle) + '">' +
          Q.esc(h.titulo.slice(0, 30)) + '</span><b>' +
          Math.round(h.severidad * 100) + '%</b></div>';
      });
      if (anom) {
        elAnom.innerHTML = anom;
      } else if (est.base) {
        elAnom.innerHTML = '<p class="qa-base-hint">Sin desviaciones contra tu ' +
          'referencia — nada de placebo.</p>';
      } else {
        elAnom.innerHTML = '<p class="qa-base-hint">' +
          Q.esc(est.motivo || 'Sin referencia fijada.') + '</p>';
      }
      btnBase.textContent = est.base ? 'refijar base' : 'fijar base';
    }

    // ── datos ─────────────────────────────────────────────────────────
    function cargarNivel(n, alTerminar) {
      if (cache[n]) { if (alTerminar) alTerminar(); return; }
      var mia = ++reqSeq;
      fetch('/api/v1/autogenes/qualia/red?nivel=' + n)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (mia !== reqSeq && cache[n]) return;
          if (!j || j.error) {
            elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase();
            return;
          }
          cache[n] = j;
          if (!niveles) { niveles = j.niveles; pintarDial(); }
          if (alTerminar) alTerminar();
        })
        .catch(function () { elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }
    function irANivel(n) {
      nivel = n; comSel = null; comFija = null;
      Array.prototype.forEach.call(elDial.children, function (b, i) {
        b.className = i === n ? 'activo' : '';
      });
      cargarNivel(n, function () {
        var d = cache[nivel];
        dibujar();
        if (d) pintarFicha(d);
        if (n + 1 < niveles.length) cargarNivel(n + 1, dibujar);
      });
    }
    function pintarDial() {
      elDial.innerHTML = '';
      niveles.forEach(function (cnt, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = (i === 0 ? 'detalle' : 'agrupado ×' + i) + ' · ' + cnt;
        b.addEventListener('click', function () { irANivel(i); });
        elDial.appendChild(b);
      });
      if (elDial.children[nivel]) elDial.children[nivel].className = 'activo';
    }
    function cargarEstado() {
      fetch('/api/v1/autogenes/qualia/estado')
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && !j.error) pintarEstado(j); })
        .catch(function () { /* la ficha vive sin red; el lienzo ya avisó */ });
    }

    // ── gestos: aislar comunidad (hover), fijarla o promover el inset ──
    canvas.addEventListener('mousemove', function (ev) {
      var caja = canvas.getBoundingClientRect();
      var x = ev.clientX - caja.left, y = ev.clientY - caja.top, enc = null;
      hubsHit.forEach(function (hb) {
        if (Math.hypot(x - hb.x, y - hb.y) <= hb.r) enc = hb.com;
      });
      canvas.style.cursor = (enc || dentroInset(x, y)) ? 'pointer' : 'default';
      if (enc !== comSel) { comSel = enc; dibujar(); }
    });
    canvas.addEventListener('mouseleave', function () {
      if (comSel) { comSel = null; dibujar(); }
    });
    function dentroInset(x, y) {
      return !!insetBox && x >= insetBox.x && x <= insetBox.x + insetBox.w &&
             y >= insetBox.y && y <= insetBox.y + insetBox.h;
    }
    canvas.addEventListener('click', function (ev) {
      var caja = canvas.getBoundingClientRect();
      var x = ev.clientX - caja.left, y = ev.clientY - caja.top;
      if (dentroInset(x, y) && niveles && nivel + 1 < niveles.length) {
        irANivel(nivel + 1); return;
      }
      var hb = null;
      hubsHit.forEach(function (h) {
        if (Math.hypot(x - h.x, y - h.y) <= h.r) hb = h;
      });
      if (hb) {
        comFija = (comFija === hb.com) ? null : hb.com; dibujar();
        // drill-down: el concentrador abre su dossier de negocio (Q4)
        if (window.QualiaDossier) window.QualiaDossier.abrir(hb.etiqueta, { nodoId: hb.id });
      }
    });

    // ── base del operador ─────────────────────────────────────────────
    btnBase.addEventListener('click', function () {
      btnBase.disabled = true;
      elMsj.className = 'ag-msj'; elMsj.textContent = 'Fijando la referencia…';
      fetch('/api/v1/autogenes/qualia/base', { method: 'POST' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btnBase.disabled = false;
          elMsj.className = 'ag-msj ' + (res.ok ? 'ok' : 'error');
          elMsj.textContent = res.ok
            ? 'Referencia fijada — las desviaciones se miden contra este estado'
            : (res.j.error || 'No se pudo fijar la base');
          if (res.ok) cargarEstado();
        })
        .catch(function () {
          btnBase.disabled = false;
          elMsj.className = 'ag-msj error';
          elMsj.textContent = 'Sin conexión — reintenta';
        });
    });

    C = Q.leerColores();
    window.addEventListener('resize', dibujar);
    Q.alTema(function () { C = Q.leerColores(); dibujar(); });
    cargarNivel(0, function () { irANivel(0); });
    cargarEstado();
    if (window.QualiaExport) window.QualiaExport.montar({
      canvas: canvas, archivo: 'qualia-red',
      metodo: 'proyección F2 · comunidades por propagación de etiquetas',
      datos: function () {
        var d = cache[nivel]; if (!d) return { headers: [], filas: [] };
        var r = d.resumen, filas = [
          ['spec', 'nodos', r.n_nodos], ['spec', 'enlaces', r.n_enlaces],
          ['spec', 'densidad', r.densidad], ['spec', 'comunidades', r.n_comunidades],
          ['spec', 'componentes', r.n_componentes]];
        r.hubs.forEach(function (h) { filas.push(['concentrador', h.etiqueta, h.grado]); });
        r.puentes.forEach(function (p) { filas.push(['puente', p.etiqueta, p.grado]); });
        return { headers: ['tipo', 'entidad', 'valor'], filas: filas };
      }
    });
  });
})();
