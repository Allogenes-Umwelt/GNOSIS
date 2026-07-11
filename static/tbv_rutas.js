/* GNOSIS · TBV-03 RUTAS — flujo país → aduana sobre teselas OSM.
   Proyección Web Mercator calculada a mano (sin librerías): las teselas
   se piden a tile.openstreetmap.org y encima se trazan arcos cuyo grosor
   es proporcional a las unidades REALES del flujo. El origen es el
   centroide del país (declarado: el puerto de salida no está en los
   datos). Si las teselas no llegan se confiesa y los arcos se dibujan
   sobre una retícula de coordenadas. Datos: /api/v1/tableros/rutas. */
(function () {
  'use strict';

  var TILE = 256;
  var TILE_URL = 'https://tile.openstreetmap.org/';
  var ZOOM_MAX = 6;
  var MARGEN = 34;

  document.addEventListener('DOMContentLoaded', function () {
    var elLista = document.getElementById('tu-lista');
    var elDecl = document.getElementById('tu-declaraciones');
    var elDetalle = document.getElementById('tu-detalle');
    var lienzo = document.getElementById('tu-lienzo');
    var canvas = lienzo && lienzo.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');
    var datos = null;
    var activo = -1;
    var trazos = [];          // polilíneas muestreadas por arco (hit areas)
    var teselas = {};         // "z/x/y" -> {img, ok}
    var teselasFallaron = 0;
    var colores = {};

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function num(n) { return n == null ? '—' : Number(n).toLocaleString('es-MX'); }
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
        accText: cs.getPropertyValue('--acc-text').trim() || '#7FE7FF',
        danger: cs.getPropertyValue('--danger').trim() || '#FF2E88',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#999',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        mono: cs.getPropertyValue('--font-mono').trim() || 'monospace'
      };
    }
    function esOscuro() {
      return document.documentElement.getAttribute('data-theme') !== 'light';
    }
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = caja.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── Web Mercator ──────────────────────────────────────────────
    function mercX(lon, z) { return (lon + 180) / 360 * TILE * Math.pow(2, z); }
    function mercY(lat, z) {
      var r = lat * Math.PI / 180;
      var y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
      return y * TILE * Math.pow(2, z);
    }

    function puntosDeFlujos() {
      var pts = [];
      datos.flujos.forEach(function (f) {
        pts.push([f.origen.lat, f.origen.lon]);
        pts.push([f.destino.lat, f.destino.lon]);
      });
      return pts;
    }

    function encuadre(w, h) {
      // el mayor zoom entero cuyo bbox (con margen) cabe en el lienzo
      var pts = puntosDeFlujos();
      for (var z = ZOOM_MAX; z >= 1; z--) {
        var xs = pts.map(function (p) { return mercX(p[1], z); });
        var ys = pts.map(function (p) { return mercY(p[0], z); });
        var dx = Math.max.apply(null, xs) - Math.min.apply(null, xs);
        var dy = Math.max.apply(null, ys) - Math.min.apply(null, ys);
        if (dx <= w - 2 * MARGEN && dy <= h - 2 * MARGEN) {
          return {
            z: z,
            cx: (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2,
            cy: (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2
          };
        }
      }
      return { z: 1, cx: TILE, cy: TILE };
    }

    function pedirTesela(z, xt, yt) {
      var n = Math.pow(2, z);
      var xw = ((xt % n) + n) % n;                 // envolver longitud
      if (yt < 0 || yt >= n) return null;
      var clave = z + '/' + xw + '/' + yt;
      if (!teselas[clave]) {
        var img = new Image();
        var celda = { img: img, ok: false };
        teselas[clave] = celda;
        img.onload = function () { celda.ok = true; programarRedibujo(); };
        img.onerror = function () { teselasFallaron++; programarRedibujo(); };
        img.src = TILE_URL + clave + '.png';
      }
      return teselas[clave];
    }

    var redibujoPendiente = false;
    function programarRedibujo() {
      if (redibujoPendiente) return;
      redibujoPendiente = true;
      window.requestAnimationFrame(function () {
        redibujoPendiente = false;
        dibujar();
      });
    }

    function dibujar() {
      if (!ctx || !datos) return;
      leerColores();
      tamano();
      trazos = [];
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      if (!datos.flujos.length) {
        ctx.fillStyle = colores.t3;
        ctx.font = '11px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('SIN FLUJOS UBICABLES — VER DECLARACIONES', w / 2, h / 2);
        return;
      }
      var enc = encuadre(w, h);
      function X(lon) { return w / 2 + (mercX(lon, enc.z) - enc.cx); }
      function Y(lat) { return h / 2 + (mercY(lat, enc.z) - enc.cy); }

      // teselas visibles
      var x0 = Math.floor((enc.cx - w / 2) / TILE);
      var x1 = Math.floor((enc.cx + w / 2) / TILE);
      var y0 = Math.floor((enc.cy - h / 2) / TILE);
      var y1 = Math.floor((enc.cy + h / 2) / TILE);
      var pintadas = 0;
      for (var yt = y0; yt <= y1; yt++) {
        for (var xt = x0; xt <= x1; xt++) {
          var t = pedirTesela(enc.z, xt, yt);
          if (t && t.ok) {
            ctx.drawImage(t.img, Math.round(xt * TILE - enc.cx + w / 2),
                          Math.round(yt * TILE - enc.cy + h / 2), TILE, TILE);
            pintadas++;
          }
        }
      }
      if (pintadas && esOscuro()) {
        // velo para que el trazo mande sobre la tesela clara — no altera datos
        ctx.fillStyle = 'rgba(6,9,14,0.62)';
        ctx.fillRect(0, 0, w, h);
      }
      if (!pintadas) {
        // sin teselas (aún cargando o bloqueadas): retícula honesta
        ctx.strokeStyle = alfa(colores.linea, 0.25);
        ctx.font = '8px ' + colores.mono;
        ctx.fillStyle = colores.t3;
        for (var lon = -180; lon <= 180; lon += 20) {
          ctx.beginPath();
          ctx.moveTo(X(lon), 0); ctx.lineTo(X(lon), h);
          ctx.stroke();
        }
        for (var lat = -60; lat <= 75; lat += 15) {
          ctx.beginPath();
          ctx.moveTo(0, Y(lat)); ctx.lineTo(w, Y(lat));
          ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.fillText(teselasFallaron
          ? 'TESELAS OSM NO DISPONIBLES — ARCOS SOBRE RETÍCULA'
          : 'CARGANDO TESELAS OSM…', 8, 12);
      }

      var maxN = datos.flujos[0].n;
      datos.flujos.forEach(function (f, i) {
        var ax = X(f.origen.lon), ay = Y(f.origen.lat);
        var bx = X(f.destino.lon), by = Y(f.destino.lat);
        var mx = (ax + bx) / 2, my = (ay + by) / 2;
        var dx = bx - ax, dy = by - ay;
        var largo = Math.sqrt(dx * dx + dy * dy) || 1;
        var cx = mx - dy / largo * largo * 0.18;
        var cy = my + dx / largo * largo * 0.18;
        var sel = i === activo;
        var tinta = sel ? colores.accText : colores.acc;
        ctx.strokeStyle = alfa(tinta, sel ? 0.95 : 0.55);
        ctx.lineWidth = 1 + 5 * (f.n / maxN);
        if (sel) { ctx.shadowColor = tinta; ctx.shadowBlur = 9; }
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx, cy, bx, by);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        // extremos: origen punto, destino anillo
        ctx.fillStyle = tinta;
        ctx.beginPath(); ctx.arc(ax, ay, 3, 0, 6.283); ctx.fill();
        ctx.strokeStyle = tinta;
        ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, 6.283); ctx.stroke();
        // muestreo del arco para el área de toque
        var pts = [];
        for (var k = 0; k <= 20; k++) {
          var u = k / 20, v = 1 - u;
          pts.push([v * v * ax + 2 * v * u * cx + u * u * bx,
                    v * v * ay + 2 * v * u * cy + u * u * by]);
        }
        trazos.push({ pts: pts, i: i });
      });

      // rótulos (aduanas destino y país origen del flujo seleccionado),
      // volteados a la izquierda del punto si se saldrían del lienzo
      ctx.font = '9px ' + colores.mono;
      // con respaldo oscuro/claro para leerse sobre teselas o arcos
      function rotular(texto, px, py) {
        var ancho = ctx.measureText(texto).width;
        var izq = px + 8 + ancho > w - 4;
        var x0 = izq ? px - 8 - ancho : px + 8;
        var tinta = ctx.fillStyle;
        ctx.fillStyle = esOscuro() ? 'rgba(6,9,14,0.78)'
          : 'rgba(250,250,248,0.82)';
        ctx.fillRect(x0 - 3, py - 6, ancho + 6, 13);
        ctx.fillStyle = tinta;
        ctx.textAlign = 'left';
        ctx.fillText(texto, x0, py + 3);
      }
      var rotulados = {};
      datos.flujos.forEach(function (f, i) {
        var clave = f.aduana;
        if (rotulados[clave] && i !== activo) return;
        rotulados[clave] = true;
        ctx.fillStyle = i === activo ? colores.accText : colores.t1;
        rotular(f.aduana.toUpperCase(), X(f.destino.lon), Y(f.destino.lat));
        if (i === activo) {
          // arriba del nudo de arcos para que no lo tape el trazo
          rotular(f.pais.toUpperCase() + ' (CENTROIDE)',
                  X(f.origen.lon), Y(f.origen.lat) - 24);
        }
      });

      // atribución obligatoria OSM
      ctx.font = '9px ' + colores.mono;
      var texto = '© OpenStreetMap contributors';
      var ancho = ctx.measureText(texto).width + 10;
      ctx.fillStyle = esOscuro() ? 'rgba(6,9,14,0.75)' : 'rgba(250,250,248,0.8)';
      ctx.fillRect(w - ancho, h - 16, ancho, 16);
      ctx.fillStyle = colores.t3;
      ctx.textAlign = 'right';
      ctx.fillText(texto, w - 5, h - 5);
    }

    function seleccionar(i) {
      activo = i;
      pintarLista();
      pintarDetalle();
      dibujar();
    }

    function pintarLista() {
      if (!datos.flujos.length && !datos.sin_geo.length) {
        elLista.innerHTML = '<p class="qa-base-hint">Sin importaciones en ' +
          'la sesión.</p>';
        return;
      }
      var html = '';
      datos.flujos.forEach(function (f, i) {
        html += '<button type="button" class="cn-caja qa-item' +
          (i === activo ? ' activo' : '') + '" data-i="' + i + '">' +
          '<span class="clase">' + esc(f.pais_code) + '</span>' +
          '<span class="fila"><span class="titulo">' + esc(f.pais) +
          ' → ' + esc(f.aduana) + '</span>' +
          '<span class="monto neutro">' + num(f.n) + '</span></span>' +
          '<p class="detalle">' + f.pct + '% de las unidades de la sesión' +
          '</p></button>';
      });
      elLista.innerHTML = html;
      elLista.querySelectorAll('.cn-caja').forEach(function (btn) {
        btn.addEventListener('click', function () {
          seleccionar(Number(btn.dataset.i));
        });
      });
      var decl = '';
      if (datos.sin_geo.length) {
        decl = '<div class="qa-sec">Sin ubicar · declarado</div>';
        datos.sin_geo.forEach(function (s) {
          decl += '<div class="cn-ref"><b>' + esc(s.pais_code) + ' → ' +
            esc(s.aduana) + ' · ' + num(s.n) + '</b><span>' +
            esc(s.motivo) + '</span></div>';
        });
      }
      elDecl.innerHTML = decl;
    }

    function pintarDetalle() {
      var f = datos.flujos[activo];
      if (!f) { elDetalle.innerHTML = ''; return; }
      elDetalle.innerHTML = '<div class="qa-sec">' + esc(f.pais) + ' → ' +
        esc(f.aduana) + '</div><p class="qa-base-hint" style="margin:0">' +
        num(f.n) + ' unidades (' + f.pct + '% de la sesión). Origen ' +
        'anclado en el centroide de ' + esc(f.pais) + ' — el puerto de ' +
        'salida no está en los datos. Destino: aduana de ' + esc(f.aduana) +
        '.</p>';
    }

    if (canvas) {
      canvas.addEventListener('click', function (ev) {
        var caja = canvas.getBoundingClientRect();
        var mx = ev.clientX - caja.left, my = ev.clientY - caja.top;
        var mejor = -1, mejorD = 8;
        trazos.forEach(function (t) {
          t.pts.forEach(function (p) {
            var d = Math.sqrt((p[0] - mx) * (p[0] - mx) +
                              (p[1] - my) * (p[1] - my));
            if (d < mejorD) { mejorD = d; mejor = t.i; }
          });
        });
        if (mejor >= 0) seleccionar(mejor);
      });
      window.addEventListener('resize', dibujar);
      var alternador = document.getElementById('theme-toggle');
      if (alternador) alternador.addEventListener('click', function () {
        setTimeout(dibujar, 60);
      });
    }

    fetch('/api/v1/tableros/rutas')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elLista.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        datos = j;
        document.getElementById('tu-total').textContent = num(j.total);
        document.getElementById('tu-rutas').textContent = num(j.flujos.length);
        document.getElementById('tu-geo').textContent = num(j.geolocalizado);
        var sg = document.getElementById('tu-singeo');
        var sinGeoN = j.total - j.geolocalizado;
        sg.textContent = num(sinGeoN);
        sg.classList.toggle('riesgo', sinGeoN > 0);
        document.getElementById('tu-nota').textContent = j.nota;
        pintarLista();
        dibujar();
      })
      .catch(function () {
        elLista.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
      });
  });
})();
