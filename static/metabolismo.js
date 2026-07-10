/* GNOSIS · Metabolismo — la vía de producción de conocimiento del caso
   como red metabólica con balance pre/post (FBA). Spine horizontal:
   FUENTES → FRAGMENTOS → ENTIDADES → RELACIONES → PRODUCTOS. Cada
   reacción muestra dos bandas: POTENCIAL (pre, tenue) y REALIZADO (post,
   sólida cyan); la diferencia se desprende hacia abajo como FUGA (rama
   magenta) — que es una señal accionable real (fuentes frías, huérfanas).
   Partículas de flux corren por la banda realizada (pirotecnia con
   sentido); tap en una fuga abre sus items. SALUD = rendimiento
   metabólico. prefers-reduced-motion: sin flux, bandas plenas y quietas.
   Datos: /api/v1/autogenes/metabolismo. Determinista: sin Math.random. */
(function () {
  'use strict';

  var BANDA = 64;          // alto máximo de la banda potencial
  var FUGA_MAX = 78;       // caída máxima de la rama de fuga

  function montar(cont) {
    var canvas = cont.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var detalle = document.querySelector(cont.getAttribute('data-detalle') || '') || null;
    var info = document.querySelector(cont.getAttribute('data-info') || '') || null;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var colores = {}, datos = null, layout = null, sel = null, animando = false;

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
        danger: cs.getPropertyValue('--danger').trim() || '#F57F9C',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA'
      };
    }
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = Math.max(460, caja.height) * dpr;
      canvas.style.height = Math.max(460, caja.height) + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function calcularLayout() {
      if (!datos) return;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var margen = 96, spineY = h * 0.56;   // spine bajo: gauge arriba, fugas abajo
      var pools = datos.pools;
      var gap = (w - margen * 2) / (pools.length - 1);
      var maxTotal = Math.max.apply(null, pools.map(function (p) { return p.total; }).concat([1]));

      var nodos = pools.map(function (p, i) {
        return {
          x: margen + i * gap, y: spineY, pool: p,
          r: 16 + 30 * Math.sqrt(p.total / maxTotal)
        };
      });
      // reacción i conecta pool i → pool i+1 (vía lineal, sin saltos)
      var reacciones = datos.reacciones.map(function (r, i) {
        var rend = r.potencial > 0 ? r.realizado / r.potencial : 1;
        return { r: r, a: nodos[i], b: nodos[i + 1], rend: rend,
                 fugaRel: r.potencial > 0 ? r.fuga / r.potencial : 0 };
      });
      layout = { nodos: nodos, reacciones: reacciones, spineY: spineY, w: w, h: h };
    }

    // gauge de salud metabólica — llena el espacio superior con dato
    function dibujarGauge() {
      if (datos.salud == null) return;
      var cx = layout.w / 2, cy = layout.h * 0.22, R = 46;
      var frac = datos.salud / 100;
      var color = datos.salud >= 66 ? colores.acc
                : datos.salud >= 33 ? colores.acc : colores.danger;
      ctx.beginPath();
      ctx.strokeStyle = conAlfa(colores.linea, 0.7);
      ctx.lineWidth = 6;
      ctx.arc(cx, cy, R, -Math.PI * 0.75, Math.PI * 0.75);
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.arc(cx, cy, R, -Math.PI * 0.75, -Math.PI * 0.75 + frac * Math.PI * 1.5);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = '700 30px "JetBrains Mono", monospace';
      ctx.fillStyle = colores.t1;
      ctx.textAlign = 'center';
      ctx.fillText(datos.salud + '%', cx, cy + 6);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = colores.t3;
      ctx.fillText('SALUD METABÓLICA', cx, cy + R + 4);
      ctx.fillText(datos.total_fugas + ' UNIDADES EN FUGA', cx, cy + R + 18);
    }

    function dibujar(ts) {
      if (!layout) return;
      var w = layout.w, h = layout.h;
      ctx.clearRect(0, 0, w, h);

      dibujarGauge();

      // reacciones (bandas pre/post + fuga)
      layout.reacciones.forEach(function (rc, idx) {
        var x0 = rc.a.x + rc.a.r, x1 = rc.b.x - rc.b.r, y = layout.spineY;
        var potH = BANDA * (rc.r.potencial > 0 ? 1 : 0.2);
        var realH = potH * rc.rend;

        // banda POTENCIAL (pre) — tenue
        ctx.fillStyle = conAlfa(colores.acc, 0.08);
        ctx.fillRect(x0, y - potH / 2, x1 - x0, potH);
        ctx.strokeStyle = conAlfa(colores.linea, 0.6);
        ctx.setLineDash([3, 5]);
        ctx.strokeRect(x0, y - potH / 2, x1 - x0, potH);
        ctx.setLineDash([]);

        // banda REALIZADA (post) — sólida
        ctx.fillStyle = conAlfa(colores.acc, 0.32);
        ctx.fillRect(x0, y - realH / 2, x1 - x0, realH);

        // partículas de flux
        if (!reduce && rc.rend > 0) {
          var n = Math.min(9, Math.max(2, Math.round(rc.r.realizado / 3)));
          for (var p = 0; p < n; p++) {
            var t = (((ts || 0) / 2600) + p / n + idx * 0.13) % 1;
            var px = x0 + (x1 - x0) * t;
            var py = y + Math.sin(p * 1.7) * realH * 0.28;
            ctx.beginPath();
            ctx.fillStyle = colores.acc;
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * Math.PI);
            ctx.arc(px, py, 1.8, 0, 6.283);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }

        // FUGA — rama magenta que se desprende hacia abajo
        if (rc.r.fuga > 0) {
          var xm = (x0 + x1) / 2;
          var caida = 30 + FUGA_MAX * Math.min(1, rc.fugaRel);
          var anchoFuga = 3 + 16 * Math.min(1, rc.fugaRel);
          ctx.beginPath();
          ctx.moveTo(xm - anchoFuga, y);
          ctx.bezierCurveTo(xm - anchoFuga, y + caida * 0.6,
                            xm - anchoFuga, y + caida, xm, y + caida);
          ctx.bezierCurveTo(xm + anchoFuga, y + caida,
                            xm + anchoFuga, y + caida * 0.6, xm + anchoFuga, y);
          ctx.closePath();
          ctx.fillStyle = conAlfa(colores.danger, 0.28);
          ctx.fill();
          ctx.strokeStyle = colores.danger;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.lineWidth = 1;
          // nodo de fuga
          rc.fugaXY = { x: xm, y: y + caida + 10, rHit: 20 };
          var esSel = sel && sel.tipo === 'fuga' && sel.rc === rc;
          ctx.beginPath();
          ctx.fillStyle = colores.danger;
          ctx.arc(rc.fugaXY.x, rc.fugaXY.y, esSel ? 8 : 6, 0, 6.283);
          ctx.fill();
          ctx.font = '11px "JetBrains Mono", monospace';
          ctx.fillStyle = colores.danger;
          ctx.textAlign = 'center';
          ctx.fillText('−' + rc.r.fuga + ' ' + (rc.r.senal || ''),
                       rc.fugaXY.x, rc.fugaXY.y + 20);
        } else {
          rc.fugaXY = null;
        }

        // rendimiento de la reacción, sobre la banda
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = colores.t3;
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(rc.rend * 100) + '%', (x0 + x1) / 2, y - potH / 2 - 8);
        ctx.fillText(rc.r.nombre.toUpperCase(), (x0 + x1) / 2, y - potH / 2 - 20);
      });

      // pools (metabolitos)
      layout.nodos.forEach(function (n) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, 6.283);
        ctx.fillStyle = conAlfa(colores.acc, 0.1);
        ctx.fill();
        ctx.strokeStyle = colores.acc;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.font = '700 14px "JetBrains Mono", monospace';
        ctx.fillStyle = colores.t1;
        ctx.textAlign = 'center';
        ctx.fillText(n.pool.total, n.x, n.y + 5);
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = colores.t3;
        ctx.fillText(n.pool.nombre, n.x, n.y + n.r + 15);
      });

      dibujarBalance();

      // brackets de esquina
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
      [[8, 8, 22, 8, 8, 22], [w - 8, 8, w - 22, 8, w - 8, 22],
       [8, h - 8, 22, h - 8, 8, h - 22], [w - 8, h - 8, w - 22, h - 8, w - 8, h - 22]]
        .forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[4], c[5]); ctx.stroke();
        });
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }

    // balance post-análisis: cada reacción de conocimiento como barra
    // realizado | fuga — la tabla FBA que llena el tercio inferior.
    function dibujarBalance() {
      var conocimiento = layout.reacciones.filter(function (rc) {
        return rc.r.clave !== 'fragmentacion';
      });
      if (!conocimiento.length) return;
      var x0 = layout.w * 0.16, x1 = layout.w * 0.84, barW = x1 - x0;
      var y0 = layout.h * 0.74, paso = Math.min(40, (layout.h * 0.2) / conocimiento.length);
      ctx.textAlign = 'left';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = colores.t3;
      ctx.fillText('BALANCE POR REACCIÓN · REALIZADO | FUGA', x0, y0 - 14);
      conocimiento.forEach(function (rc, i) {
        var y = y0 + i * paso;
        var rendW = barW * rc.rend;
        ctx.fillStyle = conAlfa(colores.acc, 0.32);
        ctx.fillRect(x0, y, rendW, 14);
        ctx.fillStyle = conAlfa(colores.danger, 0.28);
        ctx.fillRect(x0 + rendW, y, barW - rendW, 14);
        ctx.strokeStyle = conAlfa(colores.linea, 0.6);
        ctx.strokeRect(x0, y, barW, 14);
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = colores.t3;
        ctx.textAlign = 'right';
        ctx.fillText(rc.r.nombre.toUpperCase(), x0 - 10, y + 11);
        ctx.textAlign = 'left';
        ctx.fillStyle = colores.t1;
        ctx.fillText(rc.r.realizado + ' / ' + rc.r.potencial, x1 + 10, y + 11);
        if (rc.r.fuga > 0) {
          ctx.fillStyle = colores.danger;
          ctx.textAlign = 'center';
          ctx.fillText('−' + rc.r.fuga, x0 + rendW + (barW - rendW) / 2, y + 11);
          ctx.textAlign = 'left';
        }
      });
    }

    function animar() {
      if (animando || reduce) { dibujar(0); return; }
      animando = true;
      (function paso(ts) { dibujar(ts); requestAnimationFrame(paso); })(0);
    }

    canvas.addEventListener('click', function (ev) {
      var caja = canvas.getBoundingClientRect();
      var mx = ev.clientX - caja.left, my = ev.clientY - caja.top;
      sel = null;
      layout.reacciones.forEach(function (rc) {
        if (rc.fugaXY) {
          var d = (rc.fugaXY.x - mx) * (rc.fugaXY.x - mx) + (rc.fugaXY.y - my) * (rc.fugaXY.y - my);
          if (d < rc.fugaXY.rHit * rc.fugaXY.rHit) sel = { tipo: 'fuga', rc: rc };
        }
      });
      pintarDetalle();
      if (reduce) dibujar(0);
    });

    function pintarDetalle() {
      if (!detalle) return;
      if (!sel) {
        detalle.innerHTML = '<p class="gr-vacio">Toca una fuga (rama roja) para ver ' +
          'qué sustrato quedó sin metabolizar.</p>';
        return;
      }
      var r = sel.rc.r;
      var html = '<div class="gr-kind">FUGA · ' + r.nombre.toUpperCase() +
        ' · ' + r.fuga + ' ' + (r.senal || '') + '</div>';
      if (r.items && r.items.length) {
        r.items.slice(0, 12).forEach(function (it) {
          html += '<div class="gr-fila"><span>' +
            (it.nombre || it.titulo || '—').slice(0, 22) + '</span><b>' +
            (it.kind || it.tipo || '') + '</b></div>';
        });
      } else {
        html += '<p class="gr-vacio">' + r.fuga + ' unidades de sustrato sin fluir ' +
          'a la etapa siguiente.</p>';
      }
      if (r.accion) {
        html += '<a class="ag-volver" style="margin-top:10px" href="' + r.accion +
          '">Metabolizar ▸</a>';
      }
      detalle.innerHTML = html;
    }

    function pintarUrgencias() {
      var ul = document.querySelector(cont.getAttribute('data-urgencias') || '');
      if (!ul) return;
      ul.innerHTML = '';
      (datos.urgencias || []).forEach(function (u) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = u.accion || '#';
        if (!u.accion) a.style.pointerEvents = 'none';
        a.innerHTML = '<span style="color:' + (u.critico ? 'var(--danger)' : 'var(--t2)') +
          '">' + u.titulo.slice(0, 30) + '</span><span class="dato">' + u.sub + '</span>';
        li.appendChild(a);
        ul.appendChild(li);
      });
      if (!(datos.urgencias || []).length) {
        ul.innerHTML = '<li><span class="gr-vacio" style="padding:8px">' +
          'Sin urgencias temporales ni de negocio.</span></li>';
      }
    }

    function cargar() {
      fetch('/api/v1/autogenes/metabolismo')
        .then(function (r) { return r.json(); })
        .then(function (m) {
          if (!m || m.error) { if (info) info.textContent = (m && m.error) || 'SIN DATOS'; return; }
          datos = m;
          calcularLayout();
          pintarDetalle();
          pintarUrgencias();
          if (info) {
            info.textContent = 'SALUD METABÓLICA ' +
              (m.salud == null ? '—' : m.salud + '%') + ' · ' + m.total_fugas +
              ' EN FUGA · HOY ' + m.hoy;
          }
          animar();
        })
        .catch(function () { if (info) info.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }

    leerColores();
    tamano();
    window.addEventListener('resize', function () { tamano(); calcularLayout(); if (reduce) dibujar(0); });
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); if (reduce) dibujar(0); }, 60);
    });
    cargar();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.mt-lienzo').forEach(montar);
  });
})();
