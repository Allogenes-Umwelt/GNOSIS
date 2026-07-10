/* GNOSIS · Síntesis — el informe ejecutivo citado, como split
   digesto ↔ informe. A la izquierda, lo que el grafo aporta (entidades y
   fragmentos); en el centro, el informe que el modelo redacta sobre ese
   digesto. Cada punto del informe traza — con dog-leg estilo Z.O.E. — una
   línea de cita hasta el nodo del grafo que lo sustenta: la procedencia
   se ve como circuito. El servidor sanea toda cita contra los ids/nombres
   reales antes de que llegue aquí; dockear vuelve a sanear. Trazos con la
   variante AAA por modo (--acc-text); animación congelada con
   prefers-reduced-motion. Determinista. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var landing = document.getElementById('ag-landing');
    var canvas = landing && landing.querySelector('.sn-trazas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    var activo = null, fase = 0, animando = false;

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

    // ── digesto (columna izquierda) ──────────────────────────────────
    function pintarDigesto(d) {
      elEnt.innerHTML = ''; elFrag.innerHTML = '';
      nodoPorEnt = {}; nodoPorFrag = {}; fragPorId = {};
      (d.entidades || []).forEach(function (e) {
        var li = document.createElement('li');
        li.className = 'sn-nodo sn-ent';
        li.innerHTML = '<span class="k">◇</span><span class="n">' + esc(e.nombre) +
          '</span><span class="t">' + esc(e.tipo) + '</span>';
        elEnt.appendChild(li);
        nodoPorEnt[String(e.nombre).toLowerCase()] = li;
      });
      (d.fragmentos || []).forEach(function (f) {
        fragPorId[f.id] = f;
        var etq = f.fuente + (f.pagina ? ' · p.' + f.pagina : '');
        var li = document.createElement('li');
        li.className = 'sn-nodo sn-frag';
        li.innerHTML = '<span class="k">▬</span><span class="n">' + esc(etq) + '</span>';
        li.title = f.texto || '';
        elFrag.appendChild(li);
        nodoPorFrag[f.id] = li;
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
      var h = document.createElement('div');
      h.className = 'sn-titulo';
      h.textContent = inf.titulo || 'Informe del caso';
      elInforme.appendChild(h);
      if (!contarPuntos(inf)) {
        var v = document.createElement('p');
        v.className = 'gr-vacio';
        v.textContent = 'El modelo no produjo un solo punto citable — nada que anclar.';
        elInforme.appendChild(v);
        return;
      }
      (inf.secciones || []).forEach(function (s) {
        var sec = document.createElement('div');
        sec.className = 'sn-seccion';
        var enc = document.createElement('div');
        enc.className = 'sn-enc';
        enc.textContent = '▸ ' + s.encabezado;
        sec.appendChild(enc);
        (s.puntos || []).forEach(function (p) {
          var pt = document.createElement('div');
          pt.className = 'sn-punto';
          pt.tabIndex = 0;
          var chips = '';
          (p.evidencia || []).forEach(function (fid) {
            var f = fragPorId[fid];
            chips += '<span class="sn-chip frag">▬ ' + esc(f ? f.fuente : 'fragmento') + '</span>';
          });
          (p.entidades || []).forEach(function (n) {
            chips += '<span class="sn-chip ent">◇ ' + esc(n) + '</span>';
          });
          pt.innerHTML = '<span class="tx">' + esc(p.texto) + '</span>' +
            '<span class="ci">' + chips + '</span>';
          pt._p = p;
          pt.addEventListener('mouseenter', function () { activar(pt); });
          pt.addEventListener('focus', function () { activar(pt); });
          pt.addEventListener('click', function () { activar(pt); });
          sec.appendChild(pt);
        });
        elInforme.appendChild(sec);
      });
    }

    // ── activación: resalta nodos, dibuja trazas, llena la cita ───────
    function limpiarResaltado() {
      [nodoPorFrag, nodoPorEnt].forEach(function (m) {
        Object.keys(m).forEach(function (k) { m[k].classList.remove('activa'); });
      });
    }
    function activar(pt) {
      if (activo && activo !== pt) activo.classList.remove('activo');
      limpiarResaltado();
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
    function pintarCita(p) {
      elCita.innerHTML = '';
      (p.evidencia || []).forEach(function (fid) {
        var f = fragPorId[fid];
        if (!f) return;
        var d = document.createElement('div');
        d.className = 'sn-cita-frag';
        d.innerHTML = '<span class="fuente">' + esc(f.fuente) +
          (f.pagina ? ' · p.' + f.pagina : '') + '</span>' +
          '<span class="cuerpo">' + esc((f.texto || '').slice(0, 320)) + '</span>';
        elCita.appendChild(d);
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

    // ── trazas de cita (dog-leg Z.O.E.) ──────────────────────────────
    function objetivos() {
      if (!activo || landing.classList.contains('izq-off')) return [];
      var p = activo._p, outs = [];
      (p.evidencia || []).forEach(function (fid) {
        if (nodoPorFrag[fid]) outs.push({ el: nodoPorFrag[fid], kind: 'frag' });
      });
      (p.entidades || []).forEach(function (n) {
        var l = nodoPorEnt[String(n).toLowerCase()];
        if (l) outs.push({ el: l, kind: 'ent' });
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
    function trazar(A, B, kind) {
      // A = nodo (izquierda, borde derecho); B = punto (centro, borde izq)
      var midX = A.x + (B.x - A.x) * 0.5;
      var fuerte = kind === 'ent';
      ctx.strokeStyle = conAlfa(acc, fuerte ? 0.9 : 0.66);
      ctx.lineWidth = fuerte ? 1.5 : 1.1;
      ctx.setLineDash(reduce ? [] : [7, 5]);
      ctx.lineDashOffset = reduce ? 0 : -fase;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(midX, A.y);
      ctx.lineTo(midX, B.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // ticks en los codos + terminales
      ctx.strokeStyle = conAlfa(acc, 0.8);
      ctx.lineWidth = 1;
      tick(midX, A.y); tick(midX, B.y);
      ctx.fillStyle = conAlfa(acc, fuerte ? 0.95 : 0.7);
      diamante(A.x, A.y, fuerte ? 3.4 : 2.6);
      // corchete de llegada en el punto
      ctx.strokeStyle = conAlfa(acc, 0.9);
      ctx.beginPath();
      ctx.moveTo(B.x - 4, B.y - 4); ctx.lineTo(B.x, B.y - 4);
      ctx.lineTo(B.x, B.y + 4); ctx.lineTo(B.x - 4, B.y + 4);
      ctx.stroke();
    }
    function redibujar() {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      if (!activo) return;
      var B = anclaIzq(activo);
      objetivos().forEach(function (o) { trazar(anclaDer(o.el), B, o.kind); });
    }
    function animar() {
      // el rAF vive solo mientras hay un punto activo con trazas que animar
      if (reduce || animando) return;
      animando = true;
      (function paso() {
        if (!activo) { animando = false; return; }
        fase = (fase + 0.5) % 4096;
        redibujar();
        requestAnimationFrame(paso);
      })();
    }

    // ── redactar / dockear ───────────────────────────────────────────
    function redactar() {
      btnRed.disabled = true;
      elInfo.textContent = 'REDACTANDO…';
      elInforme.innerHTML = '<p class="gr-vacio">Consultando el modelo sobre el grafo del caso…</p>';
      activo = null; ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      fetch('/api/v1/autogenes/sintetizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btnRed.disabled = false;
          if (!res.ok) {
            elInfo.textContent = (res.j.error || 'NO SE PUDO REDACTAR').toUpperCase();
            elInforme.innerHTML = '<p class="gr-vacio">' + esc(res.j.error || 'Sin informe') + '</p>';
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
          elInforme.innerHTML = '<p class="gr-vacio">No se pudo contactar al modelo. ' +
            'Reintenta o revisa el proveedor LLM en admin.</p>';
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
