/* GNOSIS · Qualia — Orbe gravitacional (F7d, port de LienzoOrbe).
   Sistema orbital 3-D proyectado a ángulo FIJO. La masa ES la
   centralidad de vector propio (cuánto conecta un nodo con lo que
   conecta); el radio de órbita ES el rango (más pesado = más cerca del
   núcleo); el plano orbital ES la comunidad. Los tres cuerpos más
   pesados son monolitos en cian — inteligencia viva; el resto, gris
   documental. Totalmente estático: la geometría ES la lectura (sin
   movimiento sin información — nada que congelar). Tap "por qué pesa":
   la masa es literalmente Σ(peso del vínculo × masa del vecino), y la
   ficha muestra esa suma — mismos números que el motor.
   Datos: /api/v1/autogenes/qualia/red. */
(function () {
  'use strict';

  var ANGULO_ORO = Math.PI * (3 - Math.sqrt(5));
  var THETA = -0.5;            // ángulo de reposo de la cámara
  var FOCAL = 3;

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qo-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var elInfo = document.getElementById('qo-info');
    var elDetalle = document.getElementById('qo-detalle');
    var elMasas = document.getElementById('qo-masas');

    var colores = {};
    var datos = null;
    var cuerpos = [];
    var planos = [];
    var seleccionado = null;
    var posPantalla = [];

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
    function inclinacionDe(comunidad) {
      // seis planos orbitales abanicados simétricos a la eclíptica
      return ((comunidad % 6) / 6) * Math.PI * 0.42 - Math.PI * 0.21;
    }

    // layout orbital determinista: rango por masa, plano por comunidad,
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
          r: orden.length === 1 ? 0 : 0.16 + 0.84 * (rango / (orden.length - 1)),
          inclinacion: inclinacionDe(comunidad),
          fase: (comunidad % 6) * 0.7 + k * ANGULO_ORO,
          comunidad: comunidad
        };
      });
      planos = Object.keys(vistos).map(Number).sort(function (a, b) { return a - b; });
    }

    // espacio de órbita normalizado → cámara bajo rotación theta
    function girar(r, fase, inclinacion) {
      var x0 = Math.cos(fase) * r;
      var z0 = Math.sin(fase) * r;
      var y = z0 * Math.sin(inclinacion);
      var z1 = z0 * Math.cos(inclinacion);
      return {
        x: x0 * Math.cos(THETA) + z1 * Math.sin(THETA),
        y: y,
        z: -x0 * Math.sin(THETA) + z1 * Math.cos(THETA)
      };
    }

    function dibujar() {
      if (!datos) return;
      tamano();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
      ctx.clearRect(0, 0, w, h);

      function proy(p) {
        var s = FOCAL / (FOCAL + p.z);
        return { sx: cx + p.x * R * s, sy: cy + p.y * R * s, s: s, z: p.z };
      }

      // planos orbitales (bandas de comunidad): círculos muestreados
      var comunidadSel = null;
      cuerpos.forEach(function (c) {
        if (c.id === seleccionado) comunidadSel = c.comunidad;
      });
      planos.slice(0, 6).forEach(function (plano) {
        var inc = inclinacionDe(plano);
        var esSel = comunidadSel !== null && plano === comunidadSel;
        ctx.beginPath();
        for (var i = 0; i <= 64; i++) {
          var fase = (i / 64) * 6.283;
          var q = proy(girar(1, fase, inc));
          if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
        }
        ctx.strokeStyle = esSel ? alfa(colores.acc, 0.22) : alfa(colores.linea, 0.14);
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // el baricentro, quieto
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, 6.283);
      ctx.fillStyle = alfa(colores.t1, 0.5);
      ctx.fill();

      // cuerpos en orden de pintor (lejanos primero)
      posPantalla = [];
      var dibujables = cuerpos.map(function (c) {
        var q = proy(girar(c.r, c.fase, c.inclinacion));
        return { c: c, sx: q.sx, sy: q.sy, s: q.s, z: q.z };
      }).sort(function (a, b) { return b.z - a.z; });
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      dibujables.forEach(function (d) {
        var c = d.c, sx = d.sx, sy = d.sy, s = d.s, z = d.z;
        posPantalla.push({ x: sx, y: sy, id: c.id });
        var prof = 0.35 + 0.65 * Math.max(0, Math.min(1, (1 - z) / 2));
        var esSel = seleccionado === c.id;
        var esMonolito = c.rango < 3 && c.masa > 0;
        if (esMonolito) {
          // el monolito: losa vertical viva, escalada por masa
          var ancho = (3 + 5 * c.masa) * s;
          var alto = (10 + 22 * c.masa) * s;
          var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, alto);
          glow.addColorStop(0, alfa(colores.acc, 0.35 * prof));
          glow.addColorStop(1, alfa(colores.acc, 0));
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(sx, sy, alto, 0, 6.283); ctx.fill();
          ctx.fillStyle = alfa(colores.acc, esSel ? 1 : 0.85 * prof);
          ctx.fillRect(sx - ancho / 2, sy - alto / 2, ancho, alto);
          ctx.lineWidth = 3;
          ctx.strokeStyle = colores.fondo;
          ctx.strokeText(c.etiqueta.slice(0, 14), sx, sy - alto / 2 - 5);
          ctx.fillStyle = alfa(colores.t1, prof);
          ctx.fillText(c.etiqueta.slice(0, 14), sx, sy - alto / 2 - 5);
        } else {
          var radio = (1.5 + 3 * c.masa) * s;
          ctx.beginPath(); ctx.arc(sx, sy, radio, 0, 6.283);
          ctx.fillStyle = esSel ? colores.acc : alfa(colores.t3, prof);
          ctx.fill();
          if (esSel) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = colores.fondo;
            ctx.strokeText(c.etiqueta.slice(0, 14), sx, sy - radio - 5);
            ctx.fillStyle = alfa(colores.t1, 0.9);
            ctx.fillText(c.etiqueta.slice(0, 14), sx, sy - radio - 5);
          }
        }
        if (esSel) {
          ctx.beginPath(); ctx.arc(sx, sy, 12 * s + 4, 0, 6.283);
          ctx.strokeStyle = alfa(colores.acc, 0.6);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
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
    }

    // ── por qué pesa: Σ (peso del vínculo × masa del vecino) ─────────
    function contribuciones(id, top) {
      var acumulado = {};
      datos.red.enlaces.forEach(function (e) {
        var otro = e.origen === id ? e.destino : e.destino === id ? e.origen : null;
        if (otro === null || otro === id) return;
        acumulado[otro] = (acumulado[otro] || 0) +
          (e.peso || 0.5) * (datos.masas[otro] || 0);
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
        elDetalle.innerHTML = '<p class="qa-base-hint">Toca un cuerpo. Su masa es ' +
          'literalmente la suma de las masas de sus vecinos por el peso del ' +
          'vínculo — la explicación honesta ES esa suma.</p>';
        return;
      }
      var c = cuerpos.find(function (x) { return x.id === seleccionado; });
      var aportes = contribuciones(seleccionado, 5);
      var html = '<div class="gr-kind">RANGO ' + (c.rango + 1) + ' · MASA ' +
        c.masa.toFixed(2) + ' · COMUNIDAD ' + c.comunidad + '</div>' +
        '<div class="gr-nombre">' + esc(c.etiqueta) + '</div>';
      if (aportes.length) {
        html += '<p class="qa-base-hint">Vecinos que más aportan (peso × masa):</p>';
        aportes.forEach(function (a) {
          html += '<div class="gr-fila"><span title="' + esc(a.etiqueta) + '">' +
            esc(a.etiqueta.slice(0, 20)) + '</span><b>' + a.aporte.toFixed(2) + '</b></div>';
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
          (seleccionado === c.id ? ' activo' : '') + '" data-id="' + esc(c.id) + '">' +
          '<span title="' + esc(c.etiqueta) + '">' + (c.rango < 3 ? '▮ ' : '● ') +
          esc(c.etiqueta.slice(0, 22)) + '</span><b>' + c.masa.toFixed(2) + '</b></button>';
      });
      elMasas.innerHTML = html;
      elMasas.querySelectorAll('.qa-item').forEach(function (b) {
        b.addEventListener('click', function () {
          seleccionar(b.getAttribute('data-id'));
        });
      });
    }
    function seleccionar(id) {
      seleccionado = seleccionado === id ? null : id;
      pintarDetalle();
      pintarMasas();
      dibujar();
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
          elInfo.textContent = cuerpos.length + ' CUERPOS · MONOLITO PRINCIPAL «' +
            (cuerpos[0] ? cuerpos[0].etiqueta.slice(0, 22).toUpperCase() : '—') +
            '» · LA GEOMETRÍA ES LA LECTURA';
          pintarDetalle();
          pintarMasas();
          dibujar();
        })
        .catch(function () {
          elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO';
        });
    }

    canvas.addEventListener('pointerup', function (ev) {
      if (!datos) return;
      var caja = canvas.getBoundingClientRect();
      var sx = ev.clientX - caja.left, sy = ev.clientY - caja.top;
      var mejor = null, mejorD = 26 * 26;
      posPantalla.forEach(function (q) {
        var d = (q.x - sx) * (q.x - sx) + (q.y - sy) * (q.y - sy);
        if (d < mejorD) { mejorD = d; mejor = q.id; }
      });
      seleccionar(mejor);
    });

    leerColores();
    tamano();
    window.addEventListener('resize', dibujar);
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); dibujar(); }, 60);
    });
    cargar();
  });
})();
