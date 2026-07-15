/* GNOSIS · Qualia — Deriva del caso (F7, Q6: el octavo instrumento).
   Compara la sesión actual contra una de referencia: dos núcleos —el
   fantasma de la referencia a la izquierda, el actual sólido a la
   derecha— unidos por un haz de deriva. El cuerpo es una columna
   divergente: seis medidas del caso (conceptos, vínculos, tejido,
   comunidades, islas, concentración) crecen a la derecha (ganó, acento
   luminoso) o a la izquierda (perdió, fantasma) desde un eje central. El
   magenta NO se usa aquí: perder no es una alerta, es un hecho medido.
   La ficha derecha lista los deltas, las anomalías de deriva (mismos
   detectores del Terreno con la referencia como base) y la huella de
   cohesión —si el caso se apretó o se fragmentó—. Determinista; el lienzo
   es estático. Datos: /qualia/drift. */
(function () {
  'use strict';
  var Q = window.QualiaComun;

  var METRICAS = [
    { k: 'n_nodos', etq: 'conceptos', dec: 0 },
    { k: 'n_enlaces', etq: 'vínculos', dec: 0 },
    { k: 'densidad', etq: 'tejido', dec: 3 },
    { k: 'n_comunidades', etq: 'comunidades', dec: 0 },
    { k: 'n_componentes', etq: 'islas', dec: 0 },
    { k: 'exponente', etq: 'concentración', dec: 2 }
  ];

  document.addEventListener('DOMContentLoaded', function () {
    var cont = document.getElementById('qv-lienzo');
    var canvas = cont && cont.querySelector('canvas');
    if (!canvas || !Q) return;
    var ctx = canvas.getContext('2d');
    var elRef = document.getElementById('qv-ref');
    var elInfo = document.getElementById('qv-info');
    var elLectura = document.getElementById('qv-lectura');
    var elDeltas = document.getElementById('qv-deltas');
    var elHallazgos = document.getElementById('qv-hallazgos');
    var elCohesion = document.getElementById('qv-cohesion');

    var C = {};
    var datos = null;
    var refSel = null;

    function fnum(v, dec) {
      if (v == null) return '—';
      return dec ? Number(v).toFixed(dec) : String(Math.round(v));
    }
    function signo(v, dec) {
      if (v == null) return '—';
      var s = dec ? Math.abs(v).toFixed(dec) : String(Math.abs(Math.round(v)));
      return (v > 0 ? '+' : v < 0 ? '−' : '') + s;
    }
    // fracción del semiancho: cambio relativo a la referencia, acotado
    function frac(m) {
      if (!datos) return 0;
      var de = datos.de_valores[m.k], a = datos.a_valores[m.k];
      if (de == null || a == null) return 0;
      var base = Math.abs(de) > 1e-6 ? Math.abs(de) : 1;
      return Math.max(-1, Math.min(1, ((a - de) / base) / 1.2));
    }

    function dibujar() {
      if (!ctx) return;
      var s = Q.medir(canvas, ctx, 460), w = s.w, h = s.h, cx = w / 2;
      ctx.clearRect(0, 0, w, h);
      if (!datos || datos.sin_referencia) {
        ctx.fillStyle = C.t3; ctx.font = '13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(datos ? (datos.motivo || 'Sin referencia.')
          : 'Cargando…', cx, h / 2);
        Q.brackets(ctx, w, h, C.acc);
        return;
      }

      // fondo cósmico tenue
      var vg = ctx.createRadialGradient(cx, h / 2, 10, cx, h / 2, Math.min(w, h) * 0.72);
      vg.addColorStop(0, Q.alfa(C.acc, 0.05)); vg.addColorStop(1, Q.alfa(C.acc, 0));
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      var sd = 20260715;
      function rnd() { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; }
      for (var i = 0; i < 90; i++) {
        var dx = rnd() * w, dy = rnd() * h, br = rnd();
        ctx.beginPath(); ctx.arc(dx, dy, br < 0.9 ? 0.5 : 1, 0, 6.283);
        ctx.fillStyle = Q.alfa(C.t3, 0.03 + 0.06 * br); ctx.fill();
      }

      // ── cabecera: núcleo referencia (fantasma) → haz → núcleo actual ──
      var yc = h * 0.15, xr = w * 0.2, xa = w * 0.8;
      ctx.strokeStyle = Q.alfa(C.acc, 0.35); ctx.lineWidth = 1.4;
      ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(xr + 22, yc); ctx.lineTo(xa - 22, yc);
      ctx.stroke(); ctx.setLineDash([]);
      // flecha del sentido de la deriva
      ctx.strokeStyle = Q.alfa(C.acc, 0.7);
      ctx.beginPath(); ctx.moveTo(xa - 22, yc); ctx.lineTo(xa - 30, yc - 5);
      ctx.moveTo(xa - 22, yc); ctx.lineTo(xa - 30, yc + 5); ctx.stroke();
      // núcleo referencia: aro fantasma
      ctx.strokeStyle = Q.alfa(C.t3, 0.8); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(xr, yc, 15, 0, 6.283); ctx.stroke();
      // núcleo actual: sólido con halo
      var gl = ctx.createRadialGradient(xa, yc, 0, xa, yc, 34);
      gl.addColorStop(0, Q.alfa(C.acc, 0.4)); gl.addColorStop(1, Q.alfa(C.acc, 0));
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(xa, yc, 34, 0, 6.283); ctx.fill();
      ctx.fillStyle = Q.alfa(C.acc, 0.9); ctx.shadowColor = C.acc; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(xa, yc, 12, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = C.t3; ctx.fillText('DE ' + datos.de, xr, yc + 34);
      ctx.fillStyle = C.t1; ctx.fillText('A ' + datos.a, xa, yc + 34);

      // ── columna divergente: seis medidas desde el eje central ──
      var y0 = h * 0.34, y1 = h - 40, filas = METRICAS.length;
      var paso = (y1 - y0) / filas, maxLen = Math.min(w * 0.5 - 150, 320);
      // eje de referencia
      ctx.strokeStyle = Q.alfa(C.linea, 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, y0 - 6); ctx.lineTo(cx, y1); ctx.stroke();
      ctx.font = '9px "JetBrains Mono", monospace'; ctx.fillStyle = C.t3;
      ctx.textAlign = 'center'; ctx.fillText('REFERENCIA', cx, y0 - 12);

      METRICAS.forEach(function (m, i) {
        var y = y0 + paso * (i + 0.5);
        var de = datos.de_valores[m.k], a = datos.a_valores[m.k];
        var f = frac(m), gano = a != null && de != null && a > de;
        var perdio = a != null && de != null && a < de;
        var len = Math.abs(f) * maxLen;
        var x2 = cx + (gano ? len : -len);
        // barra
        if (gano) {
          ctx.fillStyle = Q.alfa(C.acc, 0.5); ctx.shadowColor = C.acc; ctx.shadowBlur = 6;
          ctx.fillRect(cx, y - 7, len, 14); ctx.shadowBlur = 0;
          ctx.strokeStyle = C.acc; ctx.lineWidth = 1; ctx.strokeRect(cx, y - 7, len, 14);
        } else if (perdio) {
          ctx.fillStyle = Q.alfa(C.t3, 0.16); ctx.fillRect(cx - len, y - 7, len, 14);
          ctx.strokeStyle = Q.alfa(C.t3, 0.7); ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]); ctx.strokeRect(cx - len, y - 7, len, 14); ctx.setLineDash([]);
        }
        // etiqueta de la medida (a la izquierda del bloque)
        ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = C.t1;
        ctx.textAlign = 'left'; ctx.fillText(m.etq, 30, y + 4);
        ctx.font = '9px "JetBrains Mono", monospace'; ctx.fillStyle = C.t3;
        ctx.fillText(fnum(de, m.dec) + ' → ' + fnum(a, m.dec), 30, y + 17);
        // delta al extremo de la barra
        var dv = (de == null || a == null) ? null : a - de;
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.fillStyle = gano ? C.acc : (perdio ? C.t3 : C.linea);
        ctx.textAlign = gano ? 'left' : 'right';
        ctx.fillText(signo(dv, m.dec), x2 + (gano ? 8 : -8), y + 4);
      });

      Q.brackets(ctx, w, h, C.acc);
    }

    // ── ficha derecha ─────────────────────────────────────────────────
    function bar(l, v) {
      return '<div class="qa-bar"><span class="l">' + Q.esc(l) + '</span>' +
        '<span class="v">' + Q.esc(v) + '</span></div>';
    }
    function pintarFicha() {
      if (!datos || datos.sin_referencia) {
        elLectura.innerHTML = '<p class="qa-base-hint">' +
          Q.esc(datos ? (datos.motivo || 'Sin referencia.') : 'Cargando…') + '</p>';
        elDeltas.innerHTML = ''; elHallazgos.innerHTML = ''; elCohesion.innerHTML = '';
        return;
      }
      var dn = datos.deltas.n_nodos, de2 = datos.deltas.n_enlaces;
      var tejido = datos.deltas.densidad;
      var nh = (datos.hallazgos || []).length;
      var lect = 'Desde <b>' + Q.esc(datos.de) + '</b>, el caso ' +
        (dn >= 0 ? 'ganó ' : 'perdió ') + '<b>' + Math.abs(dn) + '</b> conceptos y <b>' +
        Math.abs(de2) + '</b> vínculos; el tejido ' +
        (tejido > 0 ? 'se apretó' : tejido < 0 ? 'se aflojó' : 'no cambió') + '. ' +
        (nh ? '<b>' + nh + '</b> ' + (nh === 1 ? 'anomalía' : 'anomalías') +
          ' de deriva contra la referencia.' : 'Sin anomalías de deriva.');
      elLectura.innerHTML = '<p class="qa-lectura">' + lect + '</p>';

      var spec = '';
      METRICAS.forEach(function (m) {
        var de = datos.de_valores[m.k], a = datos.a_valores[m.k];
        var dv = (de == null || a == null) ? null : a - de;
        spec += bar(m.etq, fnum(de, m.dec) + ' → ' + fnum(a, m.dec) +
          '  (' + signo(dv, m.dec) + ')');
      });
      elDeltas.innerHTML = spec;

      var hall = '';
      (datos.hallazgos || []).forEach(function (a) {
        hall += '<div class="qa-caja anomalia"><span title="' + Q.esc(a.detalle) + '">' +
          Q.esc(a.titulo.slice(0, 34)) + '</span><b>' +
          Math.round(a.severidad * 100) + '%</b></div>';
      });
      elHallazgos.innerHTML = hall ||
        '<p class="qa-base-hint">Sin desviaciones estructurales contra la referencia.</p>';

      var cde = datos.cohesion_de || {}, ca = datos.cohesion_a || {};
      var sep = (ca.separacion_total || 0) - (cde.separacion_total || 0);
      elCohesion.innerHTML =
        bar('grupos', (cde.n_grupos || 0) + ' → ' + (ca.n_grupos || 0)) +
        bar('bien separados', (cde.n_robustos || 0) + ' → ' + (ca.n_robustos || 0)) +
        bar('separación', (cde.separacion_total || 0).toFixed(2) + ' → ' +
          (ca.separacion_total || 0).toFixed(2)) +
        '<p class="qa-base-hint" style="margin-top:6px">' +
        (sep > 0.05 ? 'El caso se fragmentó: sus grupos se separaron.'
          : sep < -0.05 ? 'El caso se apretó: sus grupos se acercaron.'
            : 'Cohesión estable entre las dos sesiones.') + '</p>';
    }

    function pintarInfo() {
      if (!datos || datos.sin_referencia) {
        elInfo.textContent = datos ? 'SIN REFERENCIA PARA COMPARAR' : 'CARGANDO LA DERIVA…';
        return;
      }
      var nh = (datos.hallazgos || []).length;
      elInfo.textContent = 'DERIVA ' + datos.de + ' → ' + datos.a + ' · ' +
        (datos.deltas.n_nodos >= 0 ? '+' : '') + datos.deltas.n_nodos + ' CONCEPTOS · ' +
        nh + (nh === 1 ? ' ANOMALÍA' : ' ANOMALÍAS');
    }

    // ── datos ─────────────────────────────────────────────────────────
    function cargar(ref) {
      var url = '/api/v1/autogenes/qualia/drift' + (ref ? '?referencia=' + ref : '');
      fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.error) { elInfo.textContent = (j && j.error ? j.error : 'SIN DATOS').toUpperCase(); return; }
        datos = j;
        pintarSelector();
        pintarInfo(); pintarFicha(); dibujar();
      }).catch(function () { elInfo.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }
    function pintarSelector() {
      if (!datos || !datos.sesiones) { elRef.innerHTML = ''; return; }
      refSel = datos.referencia || (datos.sesiones[0] && datos.sesiones[0].id);
      elRef.innerHTML = datos.sesiones.map(function (s) {
        return '<option value="' + s.id + '"' +
          (s.id === refSel ? ' selected' : '') + '>' + Q.esc(s.etiqueta) + '</option>';
      }).join('');
    }
    elRef.addEventListener('change', function () { cargar(parseInt(elRef.value, 10)); });

    if (window.QualiaExport) window.QualiaExport.montar({
      canvas: canvas, archivo: 'qualia-deriva',
      metodo: 'diferencia medida entre resúmenes de dos sesiones',
      datos: function () {
        if (!datos || datos.sin_referencia) return { headers: [], filas: [] };
        var filas = METRICAS.map(function (m) {
          var de = datos.de_valores[m.k], a = datos.a_valores[m.k];
          var dv = (de == null || a == null) ? null : a - de;
          return [m.etq, fnum(de, m.dec), fnum(a, m.dec), signo(dv, m.dec)];
        });
        return { headers: ['medida', 'referencia (' + datos.de + ')',
          'actual (' + datos.a + ')', 'delta'], filas: filas };
      }
    });
    C = Q.leerColores();
    window.addEventListener('resize', dibujar);
    Q.alTema(function () { C = Q.leerColores(); dibujar(); });
    cargar(null);
  });
})();
