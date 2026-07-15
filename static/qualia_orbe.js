/* GNOSIS · Qualia — Orbe gravitacional (Q3: uplift luminoso).
   Sistema orbital 3-D a ángulo fijo. El PESO EN LA RED (centralidad de
   vector propio) fija el rango — más peso, más cerca del núcleo; la
   comunidad fija el plano orbital. Los tres de mayor peso son
   concentradores: losas radiantes con halo; el resto, cuerpos tenues.
   Órbitas como rieles luminosos con bloom y profundidad (arco cercano
   arde más), campo de polvo determinista y destello de lente en el
   concentrador principal — presencia sin inventar dato. Las etiquetas
   top-3 salen del racimo central con líneas guía; el resto aparece al
   pasar el cursor. Estático: la geometría ES la lectura (nada que
   congelar; prefers-reduced-motion no lo afecta). «Por qué pesa» = Σ
   (fuerza del vínculo × peso del vecino), los mismos números del motor.
   Datos: /api/v1/autogenes/qualia/red. */
(function () {
  'use strict';

  var Q = window.QualiaComun;
  var ANGULO_ORO = Math.PI * (3 - Math.sqrt(5));
  var THETA = -0.62;           // ángulo de reposo de la cámara
  var FOCAL = 3.2;

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qo-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.setAttribute('role', 'img');

    var elInfo = document.getElementById('qo-info');
    var elDetalle = document.getElementById('qo-detalle');
    var elMasas = document.getElementById('qo-masas');

    var C = {};
    var datos = null;
    var cuerpos = [];
    var planos = [];
    var seleccionado = null;
    var hover = null;
    var posPantalla = [];

    function inclinacionDe(comunidad) {
      return ((comunidad % 6) / 6) * Math.PI * 0.42 - Math.PI * 0.21;
    }

    // layout orbital determinista: rango por peso, plano por comunidad,
    // fase de ángulo áureo dentro de cada plano — nunca se apilan
    function construirCuerpos() {
      var orden = Object.keys(datos.masas).map(function (id) {
        return [id, datos.masas[id]];
      }).sort(function (a, b) {
        return b[1] - a[1] || (a[0] < b[0] ? -1 : 1);
      });
      var etiquetaDe = {};
      datos.red.nodos.forEach(function (n) { etiquetaDe[n.id] = n.etiqueta; });
      var contadorPlano = {};
      var vistos = {};
      cuerpos = orden.map(function (par, rango) {
        var id = par[0], masa = par[1];
        var comunidad = datos.comunidad[id] || 0;
        var k = contadorPlano[comunidad] || 0;
        contadorPlano[comunidad] = k + 1;
        vistos[comunidad] = true;
        return {
          id: id,
          etiqueta: etiquetaDe[id] || id,
          masa: masa,
          rango: rango,
          r: orden.length === 1 ? 0 : 0.18 + 0.82 * (rango / (orden.length - 1)),
          inclinacion: inclinacionDe(comunidad),
          fase: (comunidad % 6) * 0.7 + k * ANGULO_ORO,
          comunidad: comunidad
        };
      });
      planos = Object.keys(vistos).map(Number).sort(function (a, b) { return a - b; });
    }

    // espacio de órbita normalizado → cámara bajo rotación theta
    function girar(r, fase, inc) {
      var x0 = Math.cos(fase) * r, z0 = Math.sin(fase) * r;
      var y = z0 * Math.sin(inc), z1 = z0 * Math.cos(inc);
      return {
        x: x0 * Math.cos(THETA) + z1 * Math.sin(THETA),
        y: y,
        z: -x0 * Math.sin(THETA) + z1 * Math.cos(THETA)
      };
    }

    function etiquetaEn(texto, x, y, alinear, color) {
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.textAlign = alinear; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = C.fondo;
      ctx.strokeText(texto, x, y); ctx.fillStyle = color;
      ctx.fillText(texto, x, y);
    }

    function dibujar() {
      if (!datos) return;
      var d = Q.medir(canvas, ctx, 420);
      var w = d.w, h = d.h, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
      ctx.clearRect(0, 0, w, h);

      function proy(p) {
        var s = FOCAL / (FOCAL + p.z);
        return { sx: cx + p.x * R * s, sy: cy + p.y * R * s, s: s, z: p.z };
      }

      // campo de polvo determinista: profundidad cósmica, cero Math.random
      var semilla = 20260714;
      function rnd() { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; }
      for (var pp = 0; pp < 90; pp++) {
        var ang = rnd() * 6.283, rad = Math.pow(rnd(), 0.5) * Math.min(w, h) * 0.62;
        var px = cx + Math.cos(ang) * rad * 1.35, py = cy + Math.sin(ang) * rad * 0.6, br = rnd();
        ctx.beginPath(); ctx.arc(px, py, br < 0.9 ? 0.7 : 1.3, 0, 6.283);
        ctx.fillStyle = Q.alfa(C.t3, 0.04 + 0.10 * br); ctx.fill();
      }

      // pozo de gravedad: bloom central en capas
      var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.62);
      bg.addColorStop(0, Q.alfa(C.acc, 0.14)); bg.addColorStop(0.4, Q.alfa(C.acc, 0.05));
      bg.addColorStop(1, Q.alfa(C.acc, 0));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, 6.283); ctx.fill();

      // anillos de comunidad: rieles luminosos con bloom y profundidad
      ctx.lineCap = 'round';
      planos.slice(0, 6).forEach(function (plano) {
        var inc = inclinacionDe(plano), j, q;
        ctx.shadowColor = C.acc; ctx.shadowBlur = 16;
        ctx.beginPath();
        for (j = 0; j <= 72; j++) {
          q = proy(girar(1, (j / 72) * 6.283, inc));
          if (j === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
        }
        ctx.strokeStyle = Q.alfa(C.acc, 0.10); ctx.lineWidth = 3.2; ctx.stroke();
        ctx.shadowBlur = 8;
        for (var i = 0; i < 72; i++) {
          var a = proy(girar(1, (i / 72) * 6.283, inc)), b = proy(girar(1, ((i + 1) / 72) * 6.283, inc));
          var near = Math.max(0, Math.min(1, (1 - (a.z + b.z) / 2) / 2));
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
          ctx.strokeStyle = Q.alfa(C.acc, 0.10 + 0.40 * near);
          ctx.lineWidth = 0.8 + 1.7 * near; ctx.stroke();
        }
      });
      ctx.shadowBlur = 0; ctx.lineCap = 'butt';

      // baricentro (centro de gravedad del caso)
      ctx.shadowColor = C.acc; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 6.283); ctx.fillStyle = Q.alfa(C.t1, 0.7); ctx.fill();
      ctx.shadowBlur = 0;

      // cuerpos: pintor lejano→cercano
      posPantalla = [];
      var draw = cuerpos.map(function (c) {
        var q = proy(girar(c.r, c.fase, c.inclinacion));
        return { c: c, sx: q.sx, sy: q.sy, s: q.s, z: q.z };
      }).sort(function (a, b) { return b.z - a.z; });

      draw.forEach(function (o) {
        var c = o.c, prof = 0.32 + 0.68 * Math.max(0, Math.min(1, (1 - o.z) / 2));
        posPantalla.push({ x: o.sx, y: o.sy, id: c.id });
        if (c.rango >= 3) {
          var radio = (1.6 + 3.4 * c.masa) * o.s;
          var vivo = seleccionado === c.id || hover === c.id;
          ctx.shadowColor = C.acc; ctx.shadowBlur = (vivo ? 12 : 6) * prof;
          ctx.beginPath(); ctx.arc(o.sx, o.sy, radio, 0, 6.283);
          ctx.fillStyle = vivo ? C.acc : Q.alfa(C.t3, 0.42 * prof); ctx.fill();
          ctx.shadowBlur = 0;
          if (vivo) etiquetaEn(c.etiqueta.slice(0, 22), o.sx, o.sy - radio - 6, 'center', Q.alfa(C.t1, 0.95));
        }
      });

      // concentradores (top-3): losas radiantes
      var tops = draw.filter(function (o) { return o.c.rango < 3 && o.c.masa > 0; })
        .sort(function (a, b) { return a.c.rango - b.c.rango; });
      tops.forEach(function (o) {
        var c = o.c, prof = 0.45 + 0.55 * Math.max(0, Math.min(1, (1 - o.z) / 2));
        var ancho = (6 + 9 * c.masa) * o.s, alto = (24 + 58 * c.masa) * o.s;
        var glow = ctx.createRadialGradient(o.sx, o.sy, 0, o.sx, o.sy, alto * 1.7);
        glow.addColorStop(0, Q.alfa(C.acc, 0.40 * prof)); glow.addColorStop(0.5, Q.alfa(C.acc, 0.10 * prof));
        glow.addColorStop(1, Q.alfa(C.acc, 0));
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(o.sx, o.sy, alto * 1.7, 0, 6.283); ctx.fill();
        ctx.shadowColor = C.acc; ctx.shadowBlur = 14;
        ctx.fillStyle = Q.alfa(C.acc, (seleccionado === c.id ? 1 : 0.95) * prof);
        ctx.fillRect(o.sx - ancho / 2, o.sy - alto / 2, ancho, alto);
        ctx.shadowBlur = 0;
        ctx.fillStyle = Q.alfa(C.t1, 0.9 * prof);
        ctx.fillRect(o.sx - ancho / 2, o.sy - alto / 2, ancho, 2.5);
        if (c.rango === 0) {           // destello de lente en el principal
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.shadowColor = C.acc; ctx.shadowBlur = 12;
          var fl = alto * 1.9;
          [[fl, 0], [0, fl]].forEach(function (v) {
            var g = ctx.createLinearGradient(o.sx - v[0], o.sy - v[1], o.sx + v[0], o.sy + v[1]);
            g.addColorStop(0, Q.alfa(C.acc, 0)); g.addColorStop(0.5, Q.alfa(C.acc, 0.55));
            g.addColorStop(1, Q.alfa(C.acc, 0));
            ctx.strokeStyle = g; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(o.sx - v[0], o.sy - v[1]); ctx.lineTo(o.sx + v[0], o.sy + v[1]); ctx.stroke();
          });
          ctx.restore(); ctx.shadowBlur = 0;
        }
      });

      // líneas guía dog-leg: sacan la etiqueta top-3 del racimo central
      var slots = [{ x: cx - R * 0.92, y: cy - R * 0.62, al: 'left' },
                   { x: cx + R * 0.92, y: cy - R * 0.30, al: 'right' },
                   { x: cx + R * 0.72, y: cy + R * 0.72, al: 'right' }];
      tops.forEach(function (o, idx) {
        var s = slots[idx]; if (!s) return;
        var c = o.c, midx = (o.sx + s.x) / 2;
        ctx.beginPath(); ctx.moveTo(o.sx, o.sy); ctx.lineTo(midx, s.y); ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = Q.alfa(C.acc, 0.55); ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(o.sx, o.sy, 2, 0, 6.283); ctx.fillStyle = C.acc; ctx.fill();
        etiquetaEn(c.etiqueta.slice(0, 22), s.x, s.y - 3, s.al, C.acc);
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = s.al; ctx.textBaseline = 'top';
        ctx.fillStyle = Q.alfa(C.t3, 0.9);
        ctx.fillText('peso ' + c.masa.toFixed(2) + ' · rango ' + (c.rango + 1), s.x, s.y + 2);
      });

      Q.brackets(ctx, w, h, C.acc);
    }

    // ── por qué pesa: Σ (fuerza del vínculo × peso del vecino) ────────
    function contribuciones(id, top) {
      var acumulado = {};
      datos.red.enlaces.forEach(function (e) {
        var otro = e.origen === id ? e.destino : e.destino === id ? e.origen : null;
        if (otro === null || otro === id) return;
        acumulado[otro] = (acumulado[otro] || 0) + (e.peso || 0.5) * (datos.masas[otro] || 0);
      });
      var etiquetaDe = {};
      datos.red.nodos.forEach(function (n) { etiquetaDe[n.id] = n.etiqueta; });
      return Object.keys(acumulado).map(function (nid) {
        return { id: nid, etiqueta: etiquetaDe[nid] || nid,
                 masa: datos.masas[nid] || 0, aporte: acumulado[nid] };
      }).sort(function (a, b) {
        return b.aporte - a.aporte || (a.id < b.id ? -1 : 1);
      }).slice(0, top || 5);
    }

    function pintarDetalle() {
      if (!seleccionado) {
        elDetalle.innerHTML = '<p class="qa-base-hint">Toca un cuerpo. Su peso es ' +
          'la suma de los pesos de sus vecinos por la fuerza del vínculo — la ' +
          'explicación honesta ES esa suma.</p>';
        return;
      }
      var c = cuerpos.find(function (x) { return x.id === seleccionado; });
      var aportes = contribuciones(seleccionado, 5);
      var html = '<div class="gr-kind">RANGO ' + (c.rango + 1) + ' · PESO ' +
        c.masa.toFixed(2) + ' · COMUNIDAD ' + c.comunidad + '</div>' +
        '<div class="gr-nombre">' + Q.esc(c.etiqueta) + '</div>';
      if (aportes.length) {
        html += '<p class="qa-base-hint">Vecinos que más aportan (fuerza × peso):</p>';
        aportes.forEach(function (a) {
          html += '<div class="gr-fila"><span title="' + Q.esc(a.etiqueta) + '">' +
            Q.esc(a.etiqueta.slice(0, 20)) + '</span><b>' + a.aporte.toFixed(2) + '</b></div>';
        });
      } else {
        html += '<p class="qa-base-hint">Sin vecinos: un cuerpo aislado no pesa.</p>';
      }
      elDetalle.innerHTML = html;
    }

    function pintarMasas() {
      var html = '';
      cuerpos.slice(0, 8).forEach(function (c) {
        html += '<button type="button" class="qa-caja qa-item' +
          (seleccionado === c.id ? ' activo' : '') + '" data-id="' + Q.esc(c.id) + '">' +
          '<span title="' + Q.esc(c.etiqueta) + '">' + (c.rango < 3 ? '▮ ' : '● ') +
          Q.esc(c.etiqueta.slice(0, 22)) + '</span><b>' + c.masa.toFixed(2) + '</b></button>';
      });
      elMasas.innerHTML = html;
      elMasas.querySelectorAll('.qa-item').forEach(function (b) {
        b.addEventListener('click', function () { seleccionar(b.getAttribute('data-id')); });
      });
    }

    function seleccionar(id) {
      seleccionado = seleccionado === id ? null : id;
      pintarDetalle(); pintarMasas(); dibujar();
      // drill-down: el cuerpo seleccionado abre su dossier de negocio (Q4)
      if (seleccionado && window.QualiaDossier) {
        var c = cuerpos.find(function (x) { return x.id === seleccionado; });
        window.QualiaDossier.abrir(c ? c.etiqueta : seleccionado, { nodoId: seleccionado });
      }
    }

    function cargar() {
      fetch('/api/v1/autogenes/qualia/red')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) {
            elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase();
            return;
          }
          datos = j;
          construirCuerpos();
          var jefe = cuerpos[0] ? cuerpos[0].etiqueta : '—';
          elInfo.textContent = cuerpos.length + ' CUERPOS · CONCENTRADOR PRINCIPAL «' +
            jefe.slice(0, 22).toUpperCase() + '» · LA GEOMETRÍA ES LA LECTURA';
          canvas.setAttribute('aria-label',
            'Orbe gravitacional: ' + cuerpos.length + ' entidades por peso en la red. ' +
            'Concentrador principal ' + jefe + '. Los pesos están listados a la derecha.');
          pintarDetalle(); pintarMasas(); dibujar();
        })
        .catch(function () { elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }

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

    canvas.addEventListener('pointerup', function (ev) {
      if (!datos) return;
      seleccionar(nodoEn(ev));
    });
    // hover = vista previa (etiqueta del cuerpo bajo el cursor); redibuja
    // sólo si cambia, para no pagar el bloom en cada pixel.
    canvas.addEventListener('pointermove', function (ev) {
      if (!datos) return;
      var id = nodoEn(ev);
      if (id !== hover) { hover = id; canvas.style.cursor = id ? 'pointer' : 'crosshair'; dibujar(); }
    });
    canvas.addEventListener('pointerleave', function () {
      if (hover !== null) { hover = null; dibujar(); }
    });

    C = Q.leerColores();
    window.addEventListener('resize', dibujar);
    Q.alTema(function () { C = Q.leerColores(); dibujar(); });
    cargar();
  });
})();
