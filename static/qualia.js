/* GNOSIS · Qualia — Red del caso (F7d, dirección databook aprobada).
   El lienzo pinta la red del nivel elegido de la escalera de
   renormalización (layout filotaxis por comunidad: concentrador al
   centro, miembros en espiral áurea) y resuelve el hairball con ZOOM
   SEMÁNTICO: al alejarse, las comunidades colapsan en burbujas
   facetadas ×N con los enlaces inter-comunidad fusionados en UNA banda
   de peso Σ — el mismo agregado que computa renormalizar(), así que lo
   visual ES la topología. Etiquetas con halo, supresión voraz de
   colisiones y cuota de hojas. La ficha derecha es salida del motor:
   lectura determinista, spec, concentradores, puentes y anomalías
   medidas contra la base del operador. Trazos con la variante AAA por
   modo (--acc-text); magenta solo en anomalías reales. Determinista;
   el lienzo es estático — no hay animación que congelar.
   Datos: /api/v1/autogenes/qualia/red y /qualia/estado. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qa-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
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

    var colores = {};
    var niveles = null;          // conteo de nodos por peldaño
    var cache = {};              // nivel -> respuesta de /qualia/red
    var nivel = 0;
    var vista = { k: 1 };        // zoom semántico
    var insetBox = null;
    var reqSeq = 0;

    // Etiquetas de la red vienen de documentos: SIEMPRE escapadas.
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
        danger: cs.getPropertyValue('--danger').trim() || '#F57F9C',
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
    function radioDe(d, n) {
      var masa = d.masas[n.id] || 0;
      return 2 + 9 * Math.sqrt(masa) + (n.peso ? Math.min(6, Math.sqrt(n.peso)) : 0);
    }
    // etiqueta con halo del color de fondo: densidad sin perder lectura
    function etiqueta(texto, x, y, color) {
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = colores.fondo;
      ctx.strokeText(texto, x, y);
      ctx.fillStyle = color;
      ctx.fillText(texto, x, y);
    }

    // ── layout filotaxis por comunidad ───────────────────────────────
    function layout(d, W, H) {
      var porCom = {};
      d.red.nodos.forEach(function (n) {
        var c = d.comunidad[n.id];
        (porCom[c] = porCom[c] || []).push(n);
      });
      var coms = Object.keys(porCom).sort(function (a, b) {
        return porCom[b].length - porCom[a].length;
      });
      var maxTam = Math.max.apply(null, coms.map(function (c) { return porCom[c].length; }));
      var rCluster = 14 * Math.sqrt(maxTam);
      var rAnillo = coms.length === 1 ? 0 : Math.max(160, rCluster * 1.9);
      var ang0 = coms.length === 2 ? 0 : -1.5708;
      var pos = {};
      coms.forEach(function (c, k) {
        var ang = (k / coms.length) * 6.283 + ang0;
        var cx = Math.cos(ang) * rAnillo, cy = Math.sin(ang) * rAnillo * 0.72;
        var lista = porCom[c].slice().sort(function (a, b) {
          return (d.grado[b.id] || 0) - (d.grado[a.id] || 0)
            || (a.id < b.id ? -1 : 1);
        });
        lista.forEach(function (n, i) {
          if (i === 0) { pos[n.id] = { x: cx, y: cy, hub: true, com: c }; return; }
          var r = 13 * Math.sqrt(i), a = i * 2.39996;   // ángulo áureo
          pos[n.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, hub: false, com: c };
        });
      });
      var xs = Object.keys(pos).map(function (k) { return pos[k]; });
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      xs.forEach(function (p) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      });
      var k = Math.min(2.4, 0.84 * Math.min(
        W / Math.max(maxX - minX, 60), H / Math.max(maxY - minY, 60)));
      var ox = W / 2 - (minX + maxX) / 2 * k, oy = H / 2 - (minY + maxY) / 2 * k;
      xs.forEach(function (p) { p.x = p.x * k + ox; p.y = p.y * k + oy; });
      return pos;
    }

    // ── vista desplegada ─────────────────────────────────────────────
    function pintarRed(d, X0, Y0, W, H, esInset) {
      var pos = layout(d, W, H);
      Object.keys(pos).forEach(function (k) { pos[k].x += X0; pos[k].y += Y0; });
      var puentes = {};
      d.resumen.puentes.forEach(function (p) { puentes[p.id] = true; });

      d.red.enlaces.forEach(function (e) {
        var a = pos[e.origen], b = pos[e.destino];
        if (!a || !b) return;
        var inter = a.com !== b.com;
        ctx.strokeStyle = inter ? alfa(colores.acc, esInset ? 0.4 : 0.5)
                                : alfa(colores.linea, 0.35);
        ctx.lineWidth = inter ? (esInset ? 0.8 : 1.2) : 0.6;
        ctx.setLineDash(inter ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      ctx.setLineDash([]);

      d.red.nodos.forEach(function (n) {
        var p = pos[n.id]; if (!p) return;
        var r = radioDe(d, n) * (esInset ? 0.55 : 1);
        ctx.strokeStyle = alfa(colores.acc, p.hub ? 1 : 0.75);
        ctx.fillStyle = p.hub ? alfa(colores.acc, 0.2) : 'transparent';
        ctx.lineWidth = p.hub ? 1.6 : 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283);
        if (p.hub) ctx.fill();
        ctx.stroke();
        if (puentes[n.id]) {                 // diamante: puente de articulación
          ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - r - 6); ctx.lineTo(p.x + r + 6, p.y);
          ctx.lineTo(p.x, p.y + r + 6); ctx.lineTo(p.x - r - 6, p.y);
          ctx.closePath(); ctx.stroke();
        }
      });
      if (esInset) return;

      // etiquetas: prioridad concentrador → puente → resto por masa;
      // supresión voraz de colisiones y cuota de hojas (VINs)
      var HOJA = { vehiculo: true, fragmento: true };
      var candidatos = [];
      d.red.nodos.forEach(function (n) {
        var p = pos[n.id]; if (!p) return;
        var prio = p.hub ? 0 : puentes[n.id] ? 1 : HOJA[n.kind] ? 3 : 2;
        candidatos.push({ n: n, p: p, prio: prio, masa: d.masas[n.id] || 0 });
      });
      candidatos.sort(function (a, b) { return a.prio - b.prio || b.masa - a.masa; });
      var puestas = [], pintadas = 0, hojas = 0;
      var MAX_ETIQUETAS = 28, MAX_HOJAS = 3;
      function choca(caja) {
        return puestas.some(function (q) {
          return caja.x0 < q.x1 && caja.x1 > q.x0 && caja.y0 < q.y1 && caja.y1 > q.y0;
        });
      }
      candidatos.forEach(function (c) {
        if (pintadas >= MAX_ETIQUETAS) return;
        if (c.prio >= 2 && c.masa < 0.12) return;
        if (c.prio === 3 && hojas >= MAX_HOJAS) return;
        var texto = c.n.etiqueta.slice(0, 22);
        var w = texto.length * 6.2, h = 11;
        var x = c.p.x, y = c.p.y + radioDe(d, c.n) + 13;
        var caja = { x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y + 2 };
        if (choca(caja)) {
          if (c.prio >= 2) return;           // el resto cede el lugar
          y = c.p.y - radioDe(d, c.n) - 8;   // hub/puente sube arriba
          caja = { x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y + 2 };
          if (choca(caja)) return;
        }
        puestas.push(caja);
        pintadas++;
        if (c.prio === 3) hojas++;
        etiqueta(texto, x, y, c.prio < 2 ? colores.t1 : colores.t3);
      });
    }

    // ── vista agregada (zoom semántico): burbujas + bandas Σ ─────────
    function pintarLejos(d, W, H) {
      var pos = layout(d, W, H);
      var centros = {}, conteo = {}, hubDe = {};
      d.red.nodos.forEach(function (n) {
        var p = pos[n.id]; if (!p) return;
        conteo[p.com] = (conteo[p.com] || 0) + 1;
        if (p.hub) { centros[p.com] = p; hubDe[p.com] = n; }
      });
      var bandas = {}, wMax = 1;
      d.red.enlaces.forEach(function (e) {
        var ca = d.comunidad[e.origen], cb = d.comunidad[e.destino];
        if (ca === undefined || cb === undefined || ca === cb) return;
        var k = ca < cb ? ca + '|' + cb : cb + '|' + ca;
        bandas[k] = (bandas[k] || 0) + (e.peso || 0.5);
        if (bandas[k] > wMax) wMax = bandas[k];
      });
      Object.keys(bandas).forEach(function (k) {
        var par = k.split('|');
        var a = centros[par[0]], b = centros[par[1]];
        if (!a || !b) return;
        ctx.strokeStyle = alfa(colores.acc, 0.55);
        ctx.lineWidth = 1 + 4 * Math.sqrt(bandas[k] / wMax);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        etiqueta('Σ ' + bandas[k].toFixed(1), (a.x + b.x) / 2, (a.y + b.y) / 2 - 6, colores.t3);
      });
      ctx.lineWidth = 1;
      var puentes = {};
      d.resumen.puentes.forEach(function (p) { puentes[p.id] = true; });
      Object.keys(centros).forEach(function (c, idx) {
        var p = centros[c], n = hubDe[c], cnt = conteo[c];
        var R = 14 + 11 * Math.sqrt(cnt);
        ctx.strokeStyle = colores.acc;
        ctx.fillStyle = alfa(colores.acc, 0.07);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (var i = 0; i < 9; i++) {        // burbuja facetada Z.O.E.
          var a = (i / 9) * 6.283 + idx * 0.7;
          var rr = R * (0.94 + 0.06 * Math.sin(i * 2.1 + idx));
          var x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.283);
        ctx.fillStyle = colores.acc; ctx.fill();
        if (puentes[n.id]) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x + 10, p.y);
          ctx.lineTo(p.x, p.y + 10); ctx.lineTo(p.x - 10, p.y);
          ctx.closePath(); ctx.stroke();
        }
        etiqueta(n.etiqueta.slice(0, 18), p.x, p.y + R + 14, colores.t1);
        etiqueta('×' + cnt, p.x, p.y + R + 26, colores.t3);
      });
    }

    // riel métrico funcional: leyenda de masa (radio ↔ centralidad)
    function rielMasa(H) {
      var X = 34, Y0 = 46, Y1 = H - 46;
      ctx.strokeStyle = alfa(colores.linea, 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X, Y0); ctx.lineTo(X, Y1); ctx.stroke();
      [[1.0, 'MASA 1.0'], [0.5, '0.5'], [0.1, '0.1']].forEach(function (par, i) {
        var y = Y0 + 30 + i * 64;
        var r = 2 + 9 * Math.sqrt(par[0]);
        ctx.beginPath(); ctx.moveTo(X - 4, y); ctx.lineTo(X + 4, y); ctx.stroke();
        ctx.strokeStyle = alfa(colores.acc, 0.8);
        ctx.beginPath(); ctx.arc(X + 22, y, r, 0, 6.283); ctx.stroke();
        ctx.strokeStyle = alfa(colores.linea, 0.8);
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = colores.t3; ctx.textAlign = 'left';
        ctx.fillText(par[1], X + 40, y + 3);
      });
      for (var y = Y0; y <= Y1; y += 16) {
        ctx.beginPath(); ctx.moveTo(X - 2, y); ctx.lineTo(X, y); ctx.stroke();
      }
    }

    // inset "forma renormalizada": la escala siguiente; tap la promueve
    function pintarInset(W, H) {
      insetBox = null;
      var sig = cache[nivel + 1];
      if (!sig) return;
      var IW = 210, IH = 150, X0 = W - IW - 18, Y0 = H - IH - 18;
      insetBox = { x: X0, y: Y0, w: IW, h: IH };
      ctx.fillStyle = alfa(colores.fondo, 0.55); ctx.fillRect(X0, Y0, IW, IH);
      ctx.strokeStyle = alfa(colores.linea, 0.9); ctx.lineWidth = 1;
      ctx.strokeRect(X0, Y0, IW, IH);
      pintarRed(sig, X0, Y0, IW, IH - 18, true);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = colores.acc; ctx.textAlign = 'left';
      ctx.fillText('FORMA RENORMALIZADA · ESCALA ' + (nivel + 1) + ' · ' +
                   sig.red.nodos.length + ' NODOS ▸', X0 + 8, Y0 + IH - 7);
    }

    function esAgregada(d) {
      return vista.k < 0.72 && d.red.nodos.length > 40;
    }

    function dibujar() {
      var d = cache[nivel];
      if (!d) return;
      tamano();
      var W = canvas.clientWidth, H = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);
      var agregada = esAgregada(d);
      if (agregada) pintarLejos(d, W, H);
      else pintarRed(d, 0, 0, W, H, false);
      rielMasa(H);
      if (!agregada) pintarInset(W, H); else insetBox = null;
      // brackets de esquina (chasis del instrumento)
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
      [[8, 8, 22, 8, 8, 22], [W - 8, 8, W - 22, 8, W - 8, 22],
       [8, H - 8, 22, H - 8, 8, H - 22], [W - 8, H - 8, W - 22, H - 8, W - 8, H - 22]]
        .forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[4], c[5]); ctx.stroke();
        });
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
      pintarInfo(d);
      pintarFicha(d);
    }

    // ── ficha ────────────────────────────────────────────────────────
    function pintarInfo(d) {
      var r = d.resumen;
      elInfo.textContent = esAgregada(d)
        ? 'VISTA AGREGADA · ' + r.n_comunidades + ' COMUNIDADES DE ' + r.n_nodos +
          ' NODOS · ACÉRCATE PARA DESPLEGAR'
        : r.n_nodos + ' NODOS · ' + r.n_enlaces + ' ENLACES · ESCALA ' + nivel +
          ' DE ' + (niveles.length - 1);
    }
    function pintarFicha(d) {
      var r = d.resumen;
      var spec = '';
      [['nodos', r.n_nodos], ['enlaces', r.n_enlaces],
       ['densidad', r.densidad.toFixed(4)], ['comunidades', r.n_comunidades],
       ['componentes', r.n_componentes], ['mayor comunidad', r.comunidad_mayor]]
        .forEach(function (kv) {
          spec += '<div class="qa-bar"><span class="l">' + kv[0] + '</span>' +
            '<span class="v">' + esc(kv[1]) + '</span></div>';
        });
      elSpec.innerHTML = spec;
      var hubs = '';
      r.hubs.forEach(function (h) {
        hubs += '<div class="qa-caja"><span title="' + esc(h.etiqueta) + '">' +
          esc(h.etiqueta.slice(0, 24)) + '</span><b>×' + h.grado.toFixed(1) + '</b></div>';
      });
      elHubs.innerHTML = hubs || '<p class="qa-base-hint">Sin conexiones aún.</p>';
      var pts = '';
      r.puentes.forEach(function (p) {
        pts += '<div class="qa-caja puente"><span title="' + esc(p.etiqueta) + '">◇ ' +
          esc(p.etiqueta.slice(0, 24)) + '</span><b>' + p.grado.toFixed(1) + '</b></div>';
      });
      elPuentes.innerHTML = pts ||
        '<p class="qa-base-hint">Sin puentes — la red no depende de un solo nodo.</p>';
    }
    function pintarEstado(est) {
      var lect = '';
      (est.lectura || []).forEach(function (linea) {
        lect += '<p class="qa-lectura">' + esc(linea) + '</p>';
      });
      elLectura.innerHTML = lect || '<p class="qa-base-hint">Sin red que leer.</p>';
      var anom = '';
      (est.hallazgos || []).forEach(function (h) {
        anom += '<div class="qa-caja anomalia"><span title="' + esc(h.detalle) + '">' +
          esc(h.titulo.slice(0, 30)) + '</span><b>' +
          Math.round(h.severidad * 100) + '%</b></div>';
      });
      if (anom) {
        elAnom.innerHTML = anom;
      } else if (est.base) {
        elAnom.innerHTML = '<p class="qa-base-hint">Sin desviaciones contra tu ' +
          'referencia — nada de placebo.</p>';
      } else {
        elAnom.innerHTML = '<p class="qa-base-hint">' +
          esc(est.motivo || 'Sin referencia fijada.') + '</p>';
      }
      btnBase.textContent = est.base ? 'refijar base' : 'fijar base';
    }

    // ── datos ────────────────────────────────────────────────────────
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
        .catch(function () {
          elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
        });
    }
    function irANivel(n) {
      nivel = n;
      vista.k = 1;               // cada peldaño arranca desplegado
      Array.prototype.forEach.call(elDial.children, function (b, i) {
        b.className = i === n ? 'activo' : '';
      });
      cargarNivel(n, function () {
        dibujar();
        if (n + 1 < niveles.length) cargarNivel(n + 1, dibujar);   // el inset
      });
    }
    function pintarDial() {
      elDial.innerHTML = '';
      niveles.forEach(function (cnt, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'escala ' + i + ' · ' + cnt;
        b.addEventListener('click', function () { irANivel(i); });
        elDial.appendChild(b);
      });
      elDial.children[nivel].className = 'activo';
    }
    function cargarEstado() {
      fetch('/api/v1/autogenes/qualia/estado')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) return;
          pintarEstado(j);
        })
        .catch(function () { /* la ficha vive sin red; el lienzo ya avisó */ });
    }

    // ── gestos: el zoom semántico ────────────────────────────────────
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      vista.k = Math.min(3, Math.max(0.3, vista.k * Math.pow(1.0015, -ev.deltaY)));
      dibujar();
    }, { passive: false });
    var pinchD = null;
    canvas.addEventListener('touchmove', function (ev) {
      if (ev.touches.length !== 2) return;
      ev.preventDefault();
      var d = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX,
                         ev.touches[0].clientY - ev.touches[1].clientY);
      if (pinchD) {
        vista.k = Math.min(3, Math.max(0.3, vista.k * (d / pinchD)));
        dibujar();
      }
      pinchD = d;
    }, { passive: false });
    canvas.addEventListener('touchend', function () { pinchD = null; });
    canvas.addEventListener('click', function (ev) {
      if (!insetBox) return;
      var caja = canvas.getBoundingClientRect();
      var x = ev.clientX - caja.left, y = ev.clientY - caja.top;
      if (x >= insetBox.x && x <= insetBox.x + insetBox.w &&
          y >= insetBox.y && y <= insetBox.y + insetBox.h &&
          nivel + 1 < niveles.length) {
        irANivel(nivel + 1);
      }
    });

    // ── base del operador ────────────────────────────────────────────
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

    leerColores();
    tamano();
    window.addEventListener('resize', dibujar);
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); dibujar(); }, 60);
    });
    cargarNivel(0, function () { irANivel(0); });
    cargarEstado();
  });
})();
