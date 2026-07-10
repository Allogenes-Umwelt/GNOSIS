/* GNOSIS · Síntesis — el informe ejecutivo citado, como split
   digesto ↔ informe ↔ cita. A la izquierda, lo que el grafo aporta
   (entidades y fragmentos); en el centro, el informe que el modelo
   redacta sobre ese digesto; a la derecha, la procedencia del punto
   activo. Cada punto traza — dog-leg Z.O.E. con chaflanes de 45° y un
   BUS vertical compartido — la línea de cita hasta su nodo; tocar un
   nodo del digesto invierte el circuito y resalta los puntos que lo
   citan. El servidor sanea toda cita contra los ids/nombres reales
   antes de que llegue aquí; dockear vuelve a sanear. Trazos con la
   variante AAA por modo (--acc-text); animación congelada con
   prefers-reduced-motion; el rAF solo vive con un foco activo.
   Determinista. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var landing = document.getElementById('ag-landing');
    var canvas = landing && landing.querySelector('.sn-trazas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    var panelIzq = document.getElementById('ag-panel-izq');
    var elEnt = document.getElementById('sn-entidades');
    var elFrag = document.getElementById('sn-fragmentos');
    var elInforme = document.getElementById('sn-informe');
    var elCita = document.getElementById('sn-cita');
    var elInfo = document.getElementById('sn-info');
    var elMsj = document.getElementById('sn-msj');
    var btnRed = document.getElementById('sn-redactar');
    var btnDock = document.getElementById('sn-dockear');

    var acc = '#00D4FF';
    var digesto = null, informeActual = null;
    var nodoPorFrag = {}, nodoPorEnt = {}, fragPorId = {};
    var puntosPorFrag = {}, puntosPorEnt = {};
    var activo = null;        // punto del informe con foco
    var nodoActivo = null;    // nodo del digesto con foco (circuito inverso)
    var fase = 0, animando = false;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function conAlfa(hex, a) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
             ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    function leerColor() {
      acc = getComputedStyle(document.documentElement)
        .getPropertyValue('--acc-text').trim() || '#00D4FF';
    }
    function tamano() {
      var caja = landing.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = caja.height * dpr;
      canvas.style.width = caja.width + 'px';
      canvas.style.height = caja.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function anclaDer(el) {
      var r = el.getBoundingClientRect(), b = landing.getBoundingClientRect();
      return { x: r.right - b.left, y: r.top - b.top + r.height / 2 };
    }
    function anclaIzq(el) {
      var r = el.getBoundingClientRect(), b = landing.getBoundingClientRect();
      return { x: r.left - b.left, y: r.top - b.top + r.height / 2 };
    }
    // Caja visible del contenido del digesto: una traza jamás cruza la
    // cabecera del panel — el nodo fuera de vista simplemente no traza.
    function cajaDigesto() {
      if (!panelIzq) return null;
      var p = panelIzq.getBoundingClientRect(), b = landing.getBoundingClientRect();
      var head = panelIzq.querySelector('.ag-panel-head');
      var top = head ? head.getBoundingClientRect().bottom : p.top;
      return { top: top - b.top, bottom: p.bottom - b.top };
    }

    // ── digesto (columna izquierda) ──────────────────────────────────
    function pintarDigesto(d) {
      elEnt.innerHTML = ''; elFrag.innerHTML = '';
      nodoPorEnt = {}; nodoPorFrag = {}; fragPorId = {};
      (d.entidades || []).forEach(function (e) {
        var li = document.createElement('li');
        li.className = 'sn-nodo sn-ent';
        li.tabIndex = 0;
        li.innerHTML = '<span class="k">◇</span><span class="n">' + esc(e.nombre) +
          '</span><span class="t">' + esc(e.tipo) + '</span>';
        li.title = e.nombre;
        elEnt.appendChild(li);
        nodoPorEnt[String(e.nombre).toLowerCase()] = li;
        conectarNodo(li, { ent: e.nombre });
      });
      (d.fragmentos || []).forEach(function (f) {
        fragPorId[f.id] = f;
        var etq = f.fuente + (f.pagina ? ' · p.' + f.pagina : '');
        var li = document.createElement('li');
        li.className = 'sn-nodo sn-frag';
        li.tabIndex = 0;
        li.innerHTML = '<span class="k">▬</span><span class="n">' + esc(etq) + '</span>';
        li.title = f.texto || '';
        elFrag.appendChild(li);
        nodoPorFrag[f.id] = li;
        conectarNodo(li, { frag: f.id });
      });
    }
    function conectarNodo(li, ref) {
      var act = function () { activarNodo(li, ref); };
      li.addEventListener('click', act);
      li.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(); }
      });
    }

    // ── informe (centro) ─────────────────────────────────────────────
    function contarPuntos(inf) {
      return (inf.secciones || []).reduce(function (n, s) {
        return n + (s.puntos || []).length;
      }, 0);
    }
    function pintarInforme(inf) {
      elInforme.innerHTML = '';
      puntosPorFrag = {}; puntosPorEnt = {};
      var eyebrow = document.createElement('div');
      eyebrow.className = 'sn-eyebrow';
      eyebrow.textContent = 'Informe ejecutivo citado';
      elInforme.appendChild(eyebrow);
      var h = document.createElement('h3');
      h.className = 'sn-titulo';
      h.textContent = inf.titulo || 'Informe del caso';
      elInforme.appendChild(h);
      if (!contarPuntos(inf)) {
        elInforme.appendChild(vacio('El modelo no produjo un solo punto citable — nada que anclar.'));
        return;
      }
      (inf.secciones || []).forEach(function (s) {
        var sec = document.createElement('div');
        sec.className = 'sn-seccion';
        var enc = document.createElement('div');
        enc.className = 'sn-enc';
        enc.innerHTML = '<b>▸</b> ' + esc(s.encabezado);
        sec.appendChild(enc);
        (s.puntos || []).forEach(function (p) {
          var pt = document.createElement('div');
          pt.className = 'sn-punto';
          pt.tabIndex = 0;
          var chips = '';
          (p.evidencia || []).forEach(function (fid) {
            var f = fragPorId[fid];
            var etq = f ? f.fuente : 'fragmento';
            chips += '<span class="sn-chip frag" title="' + esc(etq) + '">▬ ' + esc(etq) + '</span>';
          });
          (p.entidades || []).forEach(function (n) {
            chips += '<span class="sn-chip ent" title="' + esc(n) + '">◇ ' + esc(n) + '</span>';
          });
          pt.innerHTML = '<span class="tx">' + esc(p.texto) + '</span>' +
            '<span class="ci">' + chips + '</span>';
          pt._p = p;
          (p.evidencia || []).forEach(function (fid) {
            (puntosPorFrag[fid] = puntosPorFrag[fid] || []).push(pt);
          });
          (p.entidades || []).forEach(function (n) {
            var k = String(n).toLowerCase();
            (puntosPorEnt[k] = puntosPorEnt[k] || []).push(pt);
          });
          pt.addEventListener('mouseenter', function () { activar(pt); });
          pt.addEventListener('focus', function () { activar(pt); });
          pt.addEventListener('click', function () { activar(pt); });
          sec.appendChild(pt);
        });
        elInforme.appendChild(sec);
      });
    }
    function vacio(texto, cargando) {
      var d = document.createElement('div');
      d.className = 'sn-vacio';
      d.innerHTML = '<span class="marca" aria-hidden="true">◆</span>' +
        '<div class="e">' + (cargando ? 'Redactando' : 'Síntesis') + '</div>' +
        '<p>' + esc(texto) + '</p>' +
        (cargando ? '<div class="sp-scan" aria-hidden="true"></div>' : '');
      return d;
    }

    // ── activación: punto → nodos (directo) / nodo → puntos (inverso) ─
    function limpiarResaltado() {
      [nodoPorFrag, nodoPorEnt].forEach(function (m) {
        Object.keys(m).forEach(function (k) { m[k].classList.remove('activa'); });
      });
      elInforme.querySelectorAll('.sn-punto.citado').forEach(function (p) {
        p.classList.remove('citado');
      });
    }
    function activar(pt) {
      if (activo && activo !== pt) activo.classList.remove('activo');
      limpiarResaltado();
      nodoActivo = null;
      activo = pt;
      pt.classList.add('activo');
      var p = pt._p;
      (p.evidencia || []).forEach(function (fid) {
        if (nodoPorFrag[fid]) nodoPorFrag[fid].classList.add('activa');
      });
      (p.entidades || []).forEach(function (n) {
        var l = nodoPorEnt[String(n).toLowerCase()];
        if (l) l.classList.add('activa');
      });
      pintarCita(p);
      redibujar();
      animar();
    }
    function activarNodo(li, ref) {
      if (nodoActivo && nodoActivo.li === li) {          // segundo toque: apaga
        limpiarResaltado();
        nodoActivo = null;
        redibujar();
        return;
      }
      if (activo) { activo.classList.remove('activo'); activo = null; }
      limpiarResaltado();
      li.classList.add('activa');
      var puntos = ref.frag ? (puntosPorFrag[ref.frag] || [])
                            : (puntosPorEnt[String(ref.ent).toLowerCase()] || []);
      puntos.forEach(function (pt) { pt.classList.add('citado'); });
      nodoActivo = { li: li, ref: ref, puntos: puntos };
      pintarCitaNodo(ref, puntos.length);
      redibujar();
      animar();
    }
    function pintarCita(p) {
      elCita.innerHTML = '';
      (p.evidencia || []).forEach(function (fid) {
        var f = fragPorId[fid];
        if (!f) return;
        elCita.appendChild(citaFrag(f));
      });
      (p.entidades || []).forEach(function (n) {
        var e = document.createElement('span');
        e.className = 'sn-cita-ent';
        e.textContent = '◇ ' + n;
        elCita.appendChild(e);
      });
      if (!elCita.children.length) {
        elCita.innerHTML = '<p class="gr-vacio">Este punto no conserva citas visibles.</p>';
      }
    }
    function pintarCitaNodo(ref, nPuntos) {
      elCita.innerHTML = '';
      if (ref.frag && fragPorId[ref.frag]) elCita.appendChild(citaFrag(fragPorId[ref.frag]));
      var d = document.createElement('p');
      d.className = 'gr-vacio';
      d.textContent = nPuntos === 0
        ? 'Ningún punto del informe cita este nodo.'
        : (nPuntos === 1 ? 'Un punto del informe cita este nodo.'
                         : nPuntos + ' puntos del informe citan este nodo.');
      elCita.appendChild(d);
    }
    function citaFrag(f) {
      var d = document.createElement('div');
      d.className = 'sn-cita-frag';
      var texto = (f.texto || '');
      var corto = texto.length > 320 ? texto.slice(0, 319).replace(/\s+\S*$/, '') + '…' : texto;
      d.innerHTML = '<span class="fuente">' + esc(f.fuente) +
        (f.pagina ? ' · p.' + f.pagina : '') + '</span>' +
        '<span class="cuerpo">' + esc(corto) + '</span>';
      return d;
    }

    // ── trazas de cita (dog-leg Z.O.E.: bus compartido + chaflán 45°) ─
    function objetivosDe(p) {
      if (landing.classList.contains('izq-off')) return [];
      var caja = cajaDigesto(), outs = [];
      function visible(el) {
        if (!caja) return true;
        var a = anclaDer(el);
        return a.y >= caja.top + 4 && a.y <= caja.bottom - 4;
      }
      (p.evidencia || []).forEach(function (fid) {
        var l = nodoPorFrag[fid];
        if (l && visible(l)) outs.push({ el: l, kind: 'frag' });
      });
      (p.entidades || []).forEach(function (n) {
        var l = nodoPorEnt[String(n).toLowerCase()];
        if (l && visible(l)) outs.push({ el: l, kind: 'ent' });
      });
      return outs;
    }
    function tick(x, y) {
      ctx.beginPath();
      ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
      ctx.stroke();
    }
    function diamante(x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    }
    function trazar(A, B, kind, busX) {
      // A = nodo (digesto, borde derecho); B = punto (informe, borde izq);
      // busX = columna vertical compartida — el lomo del circuito.
      var C = 5;                                   // tamaño del chaflán 45°
      var s = B.y > A.y ? 1 : B.y < A.y ? -1 : 0;  // sentido vertical
      var fuerte = kind === 'ent';
      ctx.strokeStyle = conAlfa(acc, fuerte ? 0.9 : 0.66);
      ctx.lineWidth = fuerte ? 1.5 : 1.1;
      ctx.setLineDash(reduce ? [] : [7, 5]);
      ctx.lineDashOffset = reduce ? 0 : -fase;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      if (s === 0 || Math.abs(B.y - A.y) < C * 2) {
        ctx.lineTo(B.x, A.y);                      // casi horizontal: directo
      } else {
        ctx.lineTo(busX - C, A.y);
        ctx.lineTo(busX, A.y + s * C);             // chaflán de entrada
        ctx.lineTo(busX, B.y - s * C);
        ctx.lineTo(busX + C, B.y);                 // chaflán de salida
        ctx.lineTo(B.x, B.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // ticks de codo sobre el bus + terminal de origen
      ctx.strokeStyle = conAlfa(acc, 0.8);
      ctx.lineWidth = 1;
      if (s !== 0 && Math.abs(B.y - A.y) >= C * 2) { tick(busX, A.y + s * C); tick(busX, B.y - s * C); }
      ctx.fillStyle = conAlfa(acc, fuerte ? 0.95 : 0.7);
      diamante(A.x, A.y, fuerte ? 3.4 : 2.6);
    }
    // corchete de llegada: abraza TODO el borde izquierdo del elemento
    function corchete(el) {
      var r = el.getBoundingClientRect(), b = landing.getBoundingClientRect();
      var x = r.left - b.left, y0 = r.top - b.top + 2, y1 = r.bottom - b.top - 2;
      ctx.strokeStyle = conAlfa(acc, 0.9);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 4, y0); ctx.lineTo(x, y0);
      ctx.lineTo(x, y1); ctx.lineTo(x + 4, y1);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    function redibujar() {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      if (activo) {
        var B = anclaIzq(activo);
        var busX = B.x - 18;
        objetivosDe(activo._p).forEach(function (o) {
          trazar(anclaDer(o.el), B, o.kind, busX);
        });
        corchete(activo);
        return;
      }
      if (nodoActivo) {
        var caja = cajaDigesto();
        var A = anclaDer(nodoActivo.li);
        if (caja && (A.y < caja.top + 4 || A.y > caja.bottom - 4)) return;
        var kind = nodoActivo.ref.ent ? 'ent' : 'frag';
        nodoActivo.puntos.forEach(function (pt) {
          var B2 = anclaIzq(pt);
          trazar(A, B2, kind, B2.x - 18);
          corchete(pt);
        });
      }
    }
    function animar() {
      // el rAF vive solo mientras hay un foco con trazas que animar
      if (reduce || animando) return;
      animando = true;
      (function paso() {
        if (!activo && !nodoActivo) { animando = false; return; }
        fase = (fase + 0.5) % 4096;
        redibujar();
        requestAnimationFrame(paso);
      })();
    }

    // ── redactar / dockear ───────────────────────────────────────────
    function redactar() {
      btnRed.disabled = true;
      elInfo.textContent = 'REDACTANDO…';
      elInforme.innerHTML = '';
      elInforme.appendChild(vacio('Consultando el modelo sobre el grafo del caso…', true));
      activo = null; nodoActivo = null;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      fetch('/api/v1/autogenes/sintetizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btnRed.disabled = false;
          if (!res.ok) {
            elInfo.textContent = (res.j.error || 'NO SE PUDO REDACTAR').toUpperCase();
            elInforme.innerHTML = '';
            elInforme.appendChild(vacio(res.j.error || 'Sin informe'));
            btnDock.disabled = true;
            return;
          }
          digesto = res.j.digesto || { entidades: [], fragmentos: [] };
          informeActual = res.j.informe;
          pintarDigesto(digesto);
          pintarInforme(informeActual);
          var np = contarPuntos(informeActual);
          elInfo.textContent = np + ' PUNTOS · ' + res.j.fragmentos + ' FRAGMENTOS · ' +
            res.j.entidades + ' ENTIDADES';
          btnDock.disabled = np === 0;
          tamano(); redibujar();
        })
        .catch(function () {
          btnRed.disabled = false;
          elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
          elInforme.innerHTML = '';
          elInforme.appendChild(vacio('No se pudo contactar al modelo. ' +
            'Reintenta o revisa el proveedor LLM en admin.'));
        });
    }
    function dockear() {
      if (!informeActual) return;
      btnDock.disabled = true;
      elMsj.className = 'ag-msj'; elMsj.textContent = 'Dockeando…';
      fetch('/api/v1/autogenes/sintesis/dockear', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ informe: informeActual })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          elMsj.className = 'ag-msj ' + (res.ok ? 'ok' : 'error');
          elMsj.textContent = res.ok
            ? 'Dockeado como producto: ' + (res.j.producto && res.j.producto.titulo)
            : (res.j.error || 'No se pudo dockear');
          btnDock.disabled = res.ok;
        })
        .catch(function () {
          elMsj.className = 'ag-msj error';
          elMsj.textContent = 'Sin conexión — reintenta';
          btnDock.disabled = false;
        });
    }

    btnRed.addEventListener('click', redactar);
    btnDock.addEventListener('click', dockear);
    leerColor();
    tamano();
    window.addEventListener('resize', function () { tamano(); redibujar(); });
    elInforme.addEventListener('scroll', redibujar);
    document.querySelectorAll('.ag-panel').forEach(function (p) {
      p.addEventListener('scroll', redibujar);
    });
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColor(); redibujar(); }, 60);
    });
  });
})();
