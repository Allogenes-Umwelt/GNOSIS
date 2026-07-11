/* GNOSIS · SINAPSIS (F11, SNP-03) — insights por recombinación
   verificada + el lattice de refinamiento de particiones.

   Izquierda: cada insight con su cadena de composición completa (hecho
   del motor A + hecho del motor B ⇒ lectura) y gravedad DERIVADA de los
   componentes. Derecha: el diamante del lattice — ⊤ (universo DWH) se
   refina en P·CONCILIA y P·VALIDACIÓN, y su ínfimo P∧P es el
   refinamiento común; cada bloque es |celda| real del motor, las celdas
   donde nace un insight van en magenta y tocarlas resalta la tarjeta.
   Sin conjunción no hay insight y se dice. CERO snake oil.
   Datos: /api/v1/autogenes/sinapsis. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var elLista = document.getElementById('sn-insights');
    var elCeldas = document.getElementById('sn-celdas');
    var lienzo = document.getElementById('sn-lienzo');
    var canvas = lienzo && lienzo.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');
    var datos = null;
    var celdaActiva = -1;
    var hits = [];            // hit areas de celdas en el canvas
    var colores = {};

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
        acc: cs.getPropertyValue('--acc-solid').trim() || '#00D4FF',
        danger: cs.getPropertyValue('--danger').trim() || '#FF2E88',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#999',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        mono: cs.getPropertyValue('--font-mono').trim() || 'monospace'
      };
    }
    function refTexto(r) {
      return Object.keys(r).map(function (k) {
        var v = r[k];
        return esc(k) + ' ' + esc(Array.isArray(v) ? v.join(', ') : v);
      }).join(' · ');
    }

    // ── izquierda: tarjetas de insight ───────────────────────────────
    function pintarInsights(resaltar) {
      if (!datos.insights.length) {
        elLista.innerHTML = '<p class="qa-base-hint">Ninguna conjunción ' +
          'entre motores por ahora — los ' + datos.motores.length + ' motores ' +
          'consultados no comparten protagonistas. Eso también es un ' +
          'hecho, no un fallo.</p>';
        return;
      }
      var html = '';
      datos.insights.forEach(function (ins) {
        html += '<article class="sn-tarjeta' +
          (ins.clave === resaltar ? ' activo' : '') + '" data-clave="' +
          esc(ins.clave) + '">' +
          '<span class="motores">' + esc(ins.motores.join(' × ')) + '</span>' +
          '<h3 class="titulo">' + esc(ins.titulo) + '</h3>' +
          '<p class="lectura">' + esc(ins.lectura) + '</p>' +
          '<div class="sn-cadena">';
        ins.hechos.forEach(function (h) {
          html += '<div class="sn-hecho"><span class="motor">' +
            esc(h.motor) + '</span><span>' + esc(h.hecho) + '</span></div>';
        });
        html += '</div><div class="sn-pie">' +
          '<div class="sn-gravedad" title="gravedad derivada de los componentes">' +
          '<div class="nivel" style="width:' + (ins.gravedad * 100).toFixed(0) +
          '%"></div></div>' +
          '<span class="valor">' + Math.round(ins.gravedad * 100) + '%</span>' +
          '<a href="' + esc(ins.accion) + '">actuar →</a>' +
          '<button type="button" class="sn-dockear" data-clave="' +
          esc(ins.clave) + '">dockear</button></div>';
        if ((ins.refs || []).length) {
          html += '<div class="sn-refs">' +
            ins.refs.map(refTexto).join('  ·  ') + '</div>';
        }
        html += '</article>';
      });
      elLista.innerHTML = html;
      if (resaltar) {
        var el = elLista.querySelector('[data-clave="' + resaltar + '"]');
        if (el) el.scrollIntoView({ block: 'nearest' });
      }
      // dockeo re-anclador: el servidor re-ejecuta el motor y solo ancla
      // entidades reales; una conjunción deshecha se niega a dockear
      elLista.querySelectorAll('.sn-dockear').forEach(function (btn) {
        btn.addEventListener('click', function () {
          btn.disabled = true;
          btn.textContent = 'dockeando…';
          fetch('/api/v1/autogenes/sinapsis/dockear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clave: btn.dataset.clave })
          })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) {
              if (!res.ok) {
                btn.disabled = false;
                btn.textContent = res.j.error ? 'reintenta' : 'dockear';
                return;
              }
              btn.textContent = 'dockeado · ' +
                (res.j.producto.entidades.length) + ' anclas';
            })
            .catch(function () {
              btn.disabled = false;
              btn.textContent = 'sin conexión';
            });
        });
      });
    }

    // ── derecha: el diamante del lattice ─────────────────────────────
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = caja.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function barraParticion(x, y, w, alto, bloques, total, resaltarInsight) {
      // una partición como barra segmentada: ancho de bloque ∝ n real
      var cx = x;
      var segs = [];
      bloques.forEach(function (b) {
        var bw = total ? (b.n / total) * w : 0;
        var tinta = b.en_paz ? colores.acc : colores.danger;
        var esInsight = resaltarInsight && b.insight;
        ctx.fillStyle = alfa(tinta, b.en_paz ? 0.3 : (esInsight ? 0.75 : 0.45));
        ctx.fillRect(cx, y, Math.max(bw, 1), alto);
        ctx.strokeStyle = alfa(tinta, 0.9);
        ctx.lineWidth = esInsight ? 1.8 : 1;
        ctx.strokeRect(cx, y, Math.max(bw, 1), alto);
        ctx.lineWidth = 1;
        if (bw > 22) {
          ctx.fillStyle = colores.t1;
          ctx.font = '10px ' + colores.mono;
          ctx.textAlign = 'center';
          ctx.fillText(String(b.n), cx + bw / 2, y + alto / 2 + 3.5);
        }
        segs.push({ x: cx, w: Math.max(bw, 1) });
        cx += bw;
      });
      return segs;
    }

    function rotulo(texto, x, y) {
      ctx.fillStyle = colores.t3;
      ctx.font = '9px ' + colores.mono;
      ctx.textAlign = 'center';
      ctx.fillText(texto.toUpperCase(), x, y);
    }

    function dibujarReticula() {
      if (!ctx || !datos) return;
      leerColores();
      tamano();
      hits = [];
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      var ret = datos.reticula;
      var N = ret.universo.n;
      if (!N) {
        ctx.fillStyle = colores.t3;
        ctx.font = '11px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('SIN FILAS DWH — EL LATTICE NACE CON LA SESIÓN', w / 2, h / 2);
        return;
      }
      var M = 14, bw = w - M * 2, alto = 22;
      var yTop = 26, yMed = h * 0.42, yMeet = h - 58;

      // aristas del diagrama de Hasse: ⊤→P1, ⊤→P2, P1→⊥, P2→⊥
      ctx.strokeStyle = alfa(colores.linea, 0.7);
      var xq = { c: M + bw * 0.25, v: M + bw * 0.75, top: w / 2 };
      [[xq.top, yTop + alto, xq.c, yMed], [xq.top, yTop + alto, xq.v, yMed],
       [xq.c, yMed + alto, xq.top, yMeet], [xq.v, yMed + alto, xq.top, yMeet]]
        .forEach(function (a) {
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]);
          ctx.stroke();
        });

      // ⊤: el universo (partición trivial, un solo bloque)
      rotulo('⊤ · universo DWH', w / 2, yTop - 8);
      barraParticion(M, yTop, bw, alto,
        [{ clave: 'todo', etiqueta: 'todo', n: N, en_paz: true }], N, false);

      // nivel medio: las dos particiones por motor
      var mitad = bw / 2 - 10;
      rotulo(ret.particiones[0].nombre, M + mitad / 2, yMed - 8);
      barraParticion(M, yMed, mitad, alto, ret.particiones[0].bloques, N, false);
      rotulo(ret.particiones[1].nombre, M + bw - mitad / 2, yMed - 8);
      barraParticion(M + bw - mitad, yMed, mitad, alto,
                     ret.particiones[1].bloques, N, false);

      // ⊥ del diamante: el refinamiento común, celda por celda
      rotulo(ret.refinamiento.nombre + ' · refinamiento común', w / 2, yMeet - 8);
      var celdas = ret.refinamiento.celdas;
      var segs = barraParticion(M, yMeet, bw, alto, celdas, N, true);
      segs.forEach(function (s, i) {
        hits.push({ x: s.x, y: yMeet - 4, w: s.w, h: alto + 8, i: i });
        if (i === celdaActiva) {
          ctx.strokeStyle = celdas[i].insight ? colores.danger : colores.acc;
          ctx.lineWidth = 2;
          ctx.strokeRect(s.x - 1, yMeet - 3, s.w + 2, alto + 6);
          ctx.lineWidth = 1;
        }
      });
      if (!ret.universo.coincide) {
        ctx.fillStyle = colores.danger;
        ctx.font = '9px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('LOS MOTORES NO PARTEN EL MISMO UNIVERSO — REVISA', w / 2, h - 6);
      }
    }

    function pintarCeldas() {
      var celdas = datos.reticula.refinamiento.celdas;
      if (!celdas.length) {
        elCeldas.innerHTML = '<p class="qa-base-hint">Sin filas que partir.</p>';
        return;
      }
      var html = '';
      celdas.forEach(function (c, i) {
        html += '<button type="button" class="sn-celda' +
          (c.insight ? ' insight' : '') + (i === celdaActiva ? ' activo' : '') +
          '" data-i="' + i + '"><span>' + esc(c.etiqueta) +
          (c.insight ? ' · insight' : '') + '</span><b>' + c.n + '</b></button>';
      });
      elCeldas.innerHTML = html;
      elCeldas.querySelectorAll('.sn-celda').forEach(function (btn) {
        btn.addEventListener('click', function () {
          seleccionarCelda(Number(btn.dataset.i));
        });
      });
    }

    function seleccionarCelda(i) {
      celdaActiva = i;
      var celda = datos.reticula.refinamiento.celdas[i];
      pintarCeldas();
      dibujarReticula();
      pintarInsights(celda ? celda.insight : null);
    }

    if (canvas) {
      canvas.addEventListener('click', function (ev) {
        var caja = canvas.getBoundingClientRect();
        var mx = ev.clientX - caja.left, my = ev.clientY - caja.top;
        for (var k = 0; k < hits.length; k++) {
          var c = hits[k];
          if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
            seleccionarCelda(c.i);
            return;
          }
        }
      });
      window.addEventListener('resize', dibujarReticula);
      var alternador = document.getElementById('theme-toggle');
      if (alternador) alternador.addEventListener('click', function () {
        setTimeout(dibujarReticula, 60);
      });
    }

    fetch('/api/v1/autogenes/sinapsis')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elLista.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        datos = j;
        pintarInsights(null);
        pintarCeldas();
        dibujarReticula();
      })
      .catch(function () {
        elLista.innerHTML = '<p class="qa-base-hint">Sin conexión con el sustrato.</p>';
      });
  });
})();
