/* GNOSIS · Qualia — Máquina de inteligencia (F7d, puente de mando C2).
   Diagrama de acoples OODA: cuatro fases-vértice alrededor de un núcleo
   con degradado —el estado del caso—. Los acoples sólidos cruzan por el
   núcleo (la X); el lazo punteado con etiquetas es el ciclo. Cada titular
   es salida directa del motor: anomalías medidas (Observar), el ancla del
   caso por centralidad (Orientar), los puentes de articulación como
   blancos del what-if (Decidir) y el último delta de telemetría (Actuar).
   El magenta aparece SOLO cuando Observar tiene desviaciones reales,
   tiñendo su acople y el veredicto — nunca decorativo. "Leer el sistema":
   el modelo interpreta el digesto YA calculado y el saneador poda en
   servidor toda lectura que cite una clave no enviada. CERO snake oil: sin
   datos, cada fase dice por qué. Determinista; el lienzo es estático — no
   hay animación que congelar. Trazos con la variante AAA por modo
   (--acc-text). Datos: /qualia/estado, /qualia/red, /qualia/narrativa. */
(function () {
  'use strict';
  var Q = window.QualiaComun;

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qm-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');

    var elObsT = document.getElementById('qm-obs-titular');
    var elObsD = document.getElementById('qm-obs-dato');
    var elOriT = document.getElementById('qm-ori-titular');
    var elOriD = document.getElementById('qm-ori-dato');
    var elDecT = document.getElementById('qm-dec-titular');
    var elDecD = document.getElementById('qm-dec-dato');
    var elActT = document.getElementById('qm-act-titular');
    var elActD = document.getElementById('qm-act-dato');
    var elVer = document.getElementById('qm-veredicto-linea');
    var elParte = document.getElementById('qm-parte-cuerpo');
    var btnLeer = document.getElementById('qm-leer');
    var btnDockear = document.getElementById('qm-dockear');
    var elMsj = document.getElementById('qm-msj');
    var ultimaNarrativa = null;

    function signo(n) { return n > 0 ? '+' + n : String(n); }

    var C = {};
    var alertaObs = false;                              // solo Observar alerta
    var veredicto = { texto: '—', sub: 'cargando…', alerta: false };

    var VERT = [
      { key: 'obs', k: 'OBSERVAR', ci: '1', fx: 0.24, fy: 0.20, href: '/autogenes/qualia/terreno' },
      { key: 'ori', k: 'ORIENTAR', ci: '2', fx: 0.76, fy: 0.20, href: '/autogenes/qualia/orbe' },
      { key: 'dec', k: 'DECIDIR',  ci: '3', fx: 0.76, fy: 0.80, href: '/autogenes/qualia/cascada' },
      { key: 'act', k: 'ACTUAR',   ci: '4', fx: 0.24, fy: 0.80, href: '/autogenes/qualia/horizonte' }
    ];
    var LOOP = ['INTERPRETAR', 'ELEGIR', 'EJECUTAR', 'MEDIR'];   // acoples del lazo
    var hits = [];

    // ── lienzo ────────────────────────────────────────────────────────
    function etiquetaLinea(txt, x, y, col) {
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var w = ctx.measureText(txt).width;
      ctx.fillStyle = C.fondo; ctx.fillRect(x - w / 2 - 4, y - 7, w + 8, 14);
      ctx.fillStyle = col; ctx.fillText(txt, x, y);
      ctx.textBaseline = 'alphabetic';
    }
    function flecha(x, y, ang, col) {
      var s = 7; ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang - 0.4) * s, y - Math.sin(ang - 0.4) * s);
      ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang + 0.4) * s, y - Math.sin(ang + 0.4) * s);
      ctx.stroke();
    }
    function dibujar() {
      if (!ctx) return;
      var s = Q.medir(canvas, ctx, 460), w = s.w, h = s.h, cx = w / 2, cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      var n = VERT.map(function (v) { return { x: v.fx * w, y: v.fy * h, v: v }; });

      // fondo cósmico tenue (LCG determinista; sin azar por render)
      var vg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(w, h) * 0.7);
      vg.addColorStop(0, Q.alfa(C.acc, 0.045)); vg.addColorStop(1, Q.alfa(C.acc, 0));
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      var sd = 20260715;
      function rnd() { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; }
      for (var i = 0; i < 80; i++) {
        var dx = rnd() * w, dy = rnd() * h, br = rnd();
        ctx.beginPath(); ctx.arc(dx, dy, br < 0.9 ? 0.5 : 1, 0, 6.283);
        ctx.fillStyle = Q.alfa(C.t3, 0.03 + 0.06 * br); ctx.fill();
      }

      var R = Math.min(w, h) * 0.115;

      // lazo OODA: perímetro punteado, direccional, con etiqueta de acople
      for (var j = 0; j < 4; j++) {
        var a = n[j], b = n[(j + 1) % 4];
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var dirx = b.x - a.x, diry = b.y - a.y, len = Math.hypot(dirx, diry) || 1;
        ctx.setLineDash([4, 5]); ctx.strokeStyle = Q.alfa(C.acc, 0.32); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        var ang = Math.atan2(diry, dirx);
        flecha(b.x - dirx / len * 46, b.y - diry / len * 46, ang, Q.alfa(C.acc, 0.6));
        etiquetaLinea(LOOP[j], mx, my, C.t3);
      }

      // acoples: líneas sólidas vértice→núcleo (cruzan en el núcleo: la X)
      n.forEach(function (p) {
        var col = (p.v.key === 'obs' && alertaObs) ? C.danger : C.acc;
        var ang = Math.atan2(cy - p.y, cx - p.x);
        var x2 = cx - Math.cos(ang) * R * 0.9, y2 = cy - Math.sin(ang) * R * 0.9;
        ctx.strokeStyle = Q.alfa(col, 0.75); ctx.shadowColor = col; ctx.shadowBlur = 6;
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // núcleo: orbe con degradado (acople acc↔danger cuando hay alerta)
      var col0 = veredicto.alerta ? C.danger : C.acc;
      var lg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      if (veredicto.alerta) {
        lg.addColorStop(0, Q.alfa(C.danger, 0.9)); lg.addColorStop(0.55, Q.alfa(C.acc, 0.85));
        lg.addColorStop(1, Q.alfa(C.acc, 0.9));
      } else {
        lg.addColorStop(0, Q.alfa(C.acc, 0.9)); lg.addColorStop(1, Q.alfa(C.acc, 0.68));
      }
      var glow = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.9);
      glow.addColorStop(0, Q.alfa(col0, 0.22)); glow.addColorStop(1, Q.alfa(C.acc, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.9, 0, 6.283); ctx.fill();
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
      ctx.strokeStyle = Q.alfa(C.t1, 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.stroke();
      // veredicto dentro del orbe
      ctx.textAlign = 'center';
      ctx.fillStyle = Q.alfa(C.t1, 0.85); ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText('ESTADO DEL CASO', cx, cy - R * 0.42);
      ctx.fillStyle = C.t1; ctx.font = '700 32px "JetBrains Mono", monospace';
      ctx.fillText(veredicto.texto, cx, cy + R * 0.14);
      ctx.fillStyle = Q.alfa(C.t1, 0.9); ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(veredicto.sub, cx, cy + R * 0.5);

      // vértices: aros limpios con índice + etiqueta de fase
      hits = [];
      n.forEach(function (p) {
        var col = (p.v.key === 'obs' && alertaObs) ? C.danger : C.acc;
        var r = 24;
        var gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
        gl.addColorStop(0, Q.alfa(col, 0.32)); gl.addColorStop(1, Q.alfa(col, 0));
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, 6.283); ctx.fill();
        ctx.fillStyle = C.fondo; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.shadowColor = col; ctx.shadowBlur = 9;
        ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 18px "JetBrains Mono", monospace'; ctx.fillText(p.v.ci, p.x, p.y + 1);
        ctx.textBaseline = 'alphabetic';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(p.v.k, p.x, p.y + (p.y < cy ? -r - 11 : r + 20));
        hits.push({ x: p.x, y: p.y, r: r + 6, href: p.v.href });
      });

      Q.brackets(ctx, w, h, C.acc);
    }

    // ── OBSERVAR + ACTUAR: /qualia/estado ────────────────────────────
    fetch('/api/v1/autogenes/qualia/estado')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) return;
        var hallazgos = j.hallazgos || [];
        var vObs = document.getElementById('qm-observar');
        if (hallazgos.length) {
          vObs.className = 'qm-kpi nw alerta';
          alertaObs = true;
          elObsT.textContent = hallazgos.length +
            (hallazgos.length === 1 ? ' desviación medida' : ' desviaciones medidas');
          var top = hallazgos[0];
          elObsD.innerHTML = 'La más severa: <b>' + Q.esc(top.titulo) + '</b> (' +
            Math.round(top.severidad * 100) + '%). ' + Q.esc(top.detalle);
          veredicto = { texto: String(hallazgos.length), sub: 'desviaciones · base', alerta: true };
          elVer.innerHTML = ' Hoy ese núcleo pide acción — <span class="alerta">' +
            hallazgos.length + (hallazgos.length === 1 ? ' desviación' : ' desviaciones') +
            ' contra tu base</span>.';
        } else if (j.base) {
          vObs.className = 'qm-kpi nw';
          alertaObs = false;
          elObsT.textContent = 'Terreno plano';
          elObsD.textContent = 'Sin desviaciones contra tu referencia — nada de placebo.';
          veredicto = { texto: '0', sub: 'desviaciones · base', alerta: false };
          elVer.textContent = ' Hoy el núcleo está en calma: sin desviaciones contra tu base.';
        } else {
          vObs.className = 'qm-kpi nw';
          alertaObs = false;
          elObsT.textContent = 'Sin referencia';
          elObsD.textContent = j.motivo ||
            'Fija la base en el Terreno para que haya contra qué medir.';
          veredicto = { texto: '—', sub: 'sin base fijada', alerta: false };
          elVer.textContent = ' Aún no hay base fijada: el núcleo no tiene contra qué medir.';
        }

        var snaps = j.snapshots || [];
        if (snaps.length >= 2) {
          var a = snaps[snaps.length - 2], b = snaps[snaps.length - 1];
          var dn = b.n_nodos - a.n_nodos, de = b.n_enlaces - a.n_enlaces;
          elActT.textContent = signo(dn) + ' conceptos · ' + signo(de) + ' vínculos';
          elActD.innerHTML = 'Último delta medido entre muestras. <b>' +
            snaps.length + '</b> muestras en la serie.';
        } else if (snaps.length === 1) {
          elActT.textContent = '1 muestra';
          elActD.textContent = 'La serie nace: el primer delta llegará con la ' +
            'siguiente mutación del grafo.';
        } else {
          elActT.textContent = 'Sin telemetría';
          elActD.textContent = 'La telemetría nace con la primera mutación del grafo.';
        }
        dibujar();
      })
      .catch(function () {
        elObsD.textContent = 'Sin conexión con el sustrato.';
        elActD.textContent = 'Sin conexión con el sustrato.';
      });

    // ── ORIENTAR + DECIDIR: /qualia/red ──────────────────────────────
    fetch('/api/v1/autogenes/qualia/red')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) return;
        var etiquetaDe = {};
        j.red.nodos.forEach(function (nd) { etiquetaDe[nd.id] = nd.etiqueta; });
        var masas = Object.keys(j.masas).map(function (id) {
          return [id, j.masas[id]];
        }).sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
        if (masas.length) {
          elOriT.textContent = 'ancla · «' + (etiquetaDe[masas[0][0]] || masas[0][0]) + '»';
          var resto = masas.slice(1, 3).map(function (m) {
            return Q.esc(etiquetaDe[m[0]] || m[0]) + ' (' + m[1].toFixed(2) + ')';
          }).join(', ');
          elOriD.innerHTML = 'El ancla del caso: centralidad máxima. ' +
            (resto ? 'Le siguen ' + resto + '.' : '');
        } else {
          elOriT.textContent = 'Sin red';
          elOriD.textContent = 'El orbe nace cuando el caso tiene vínculos.';
        }

        var puentes = j.resumen.puentes || [];
        if (puentes.length) {
          elDecT.textContent = puentes.length +
            (puentes.length === 1 ? ' puente crítico' : ' puentes críticos');
          elDecD.innerHTML = '<b>' + puentes.map(function (p) {
            return Q.esc(p.etiqueta);
          }).join('</b>, <b>') + '</b> — si ' +
            (puentes.length === 1 ? 'cae' : 'caen') +
            ', la red se parte. Simula la caída en la cascada.';
        } else {
          elDecT.textContent = 'Sin puentes';
          elDecD.textContent = 'La red no depende de un solo nodo — redundancia real.';
        }
        dibujar();
      })
      .catch(function () {
        elOriD.textContent = 'Sin conexión con el sustrato.';
        elDecD.textContent = 'Sin conexión con el sustrato.';
      });

    // ── vértices clicables: abren su instrumento completo ────────────
    if (canvas) {
      canvas.addEventListener('mousemove', function (ev) {
        var box = canvas.getBoundingClientRect();
        var x = ev.clientX - box.left, y = ev.clientY - box.top, hit = false;
        hits.forEach(function (hb) { if (Math.hypot(x - hb.x, y - hb.y) <= hb.r) hit = true; });
        canvas.style.cursor = hit ? 'pointer' : 'default';
      });
      canvas.addEventListener('click', function (ev) {
        var box = canvas.getBoundingClientRect();
        var x = ev.clientX - box.left, y = ev.clientY - box.top;
        for (var i = 0; i < hits.length; i++) {
          if (Math.hypot(x - hits[i].x, y - hits[i].y) <= hits[i].r) {
            window.location.href = hits[i].href; return;
          }
        }
      });
    }

    // ── LEER EL SISTEMA: la narrativa saneada ────────────────────────
    btnLeer.addEventListener('click', function () {
      btnLeer.disabled = true;
      ultimaNarrativa = null;
      btnDockear.style.display = 'none';
      elMsj.className = 'ag-msj';
      elMsj.textContent = 'El modelo interpreta el digesto…';
      elParte.innerHTML = '<div class="sp-scan" aria-hidden="true" ' +
        'style="margin:16px auto"></div>';
      fetch('/api/v1/autogenes/qualia/narrativa', { method: 'POST' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btnLeer.disabled = false;
          elMsj.textContent = '';
          if (!res.ok) {
            elParte.innerHTML = '<p class="qa-base-hint">' +
              Q.esc(res.j.error || 'La lectura falló — reintenta.') + '</p>';
            return;
          }
          var nr = res.j.narrativa;
          var etiquetas = {};
          (res.j.digesto.metricas || []).forEach(function (m) {
            etiquetas[m.clave] = m.etiqueta;
          });
          (res.j.digesto.conceptos || []).forEach(function (c) {
            etiquetas[c.clave] = c.etiqueta;
          });
          var html = '<p class="qm-panorama">' + Q.esc(nr.panorama) + '</p>';
          (nr.lecturas || []).forEach(function (l) {
            html += '<div class="qm-lectura"><span class="clave">' +
              Q.esc(etiquetas[l.concepto] || l.concepto) + '</span>' +
              Q.esc(l.lectura) + '</div>';
          });
          if ((nr.observaciones || []).length) {
            html += '<ul class="qm-obs">';
            nr.observaciones.forEach(function (o) {
              html += '<li>' + Q.esc(o) + '</li>';
            });
            html += '</ul>';
          }
          html += '<p class="qa-base-hint" style="margin-top:10px">Toda lectura ' +
            'cita una clave del digesto; lo que citó claves inventadas murió en ' +
            'el saneador antes de llegar aquí.</p>';
          elParte.innerHTML = html;
          ultimaNarrativa = nr;
          if ((nr.lecturas || []).length) {
            btnDockear.style.display = '';
            btnDockear.disabled = false;
            btnDockear.textContent = 'dockear el parte';
          }
        })
        .catch(function () {
          btnLeer.disabled = false;
          elMsj.className = 'ag-msj error';
          elMsj.textContent = 'Sin conexión — reintenta';
          elParte.innerHTML = '<p class="qa-base-hint">No se pudo contactar al ' +
            'modelo. Revisa el proveedor en admin.</p>';
        });
    });

    // ── DOCKEAR EL PARTE: narrativa -> Producto{informe, qualia} ─────
    // El servidor recalcula el digesto y vuelve a sanear antes de
    // escribir; aquí solo se envía la narrativa ya mostrada.
    btnDockear.addEventListener('click', function () {
      if (!ultimaNarrativa) return;
      btnDockear.disabled = true;
      elMsj.className = 'ag-msj';
      elMsj.textContent = 'Dockeando el parte…';
      fetch('/api/v1/autogenes/qualia/parte/dockear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrativa: ultimaNarrativa })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) {
            btnDockear.disabled = false;
            elMsj.className = 'ag-msj error';
            elMsj.textContent = res.j.error || 'No se pudo dockear — reintenta';
            return;
          }
          btnDockear.textContent = 'parte dockeado';
          elMsj.className = 'ag-msj';
          elMsj.textContent = '«' + res.j.producto.titulo +
            '» ya es un producto del grafo';
        })
        .catch(function () {
          btnDockear.disabled = false;
          elMsj.className = 'ag-msj error';
          elMsj.textContent = 'Sin conexión — reintenta';
        });
    });

    C = Q.leerColores();
    if (canvas) {
      window.addEventListener('resize', dibujar);
      Q.alTema(function () { C = Q.leerColores(); dibujar(); });
      dibujar();
      if (window.QualiaExport) window.QualiaExport.montar({
        canvas: canvas, host: document.querySelector('.qm-parte'),
        archivo: 'qualia-maquina',
        metodo: 'las cuatro fases OODA, salida directa del motor',
        datos: function () {
          function t(id) { var e = document.getElementById(id); return e ? e.textContent : ''; }
          return { headers: ['fase', 'titular'], filas: [
            ['Observar', t('qm-obs-titular')], ['Orientar', t('qm-ori-titular')],
            ['Decidir', t('qm-dec-titular')], ['Actuar', t('qm-act-titular')]] };
        }
      });
    }
  });
})();
