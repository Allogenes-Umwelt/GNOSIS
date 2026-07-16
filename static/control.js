/* GNOSIS · CONTROL (A3) — la sesión en su historia. Renderiza los control
   charts SPC del motor (autogenes/control.py): por métrica citada, la serie
   transversal, la banda MEDIDA (mediana ± k·MAD) y la señal de régimen. El
   punto actual arde; fuera de banda es magenta (alerta real). Determinista;
   color por tokens. Datos: /api/v1/autogenes/control. */
window.Control = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtVal(v, unidad) {
    if (v == null) return '—';
    if (unidad === '%') return Math.round(v) + '<span class="cs-u">%</span>';
    if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2) + '<span class="cs-u">M MXN</span>';
    return '$' + Math.round(v).toLocaleString('es-MX') + '<span class="cs-u">MXN</span>';
  }
  function fmtCorto(v) {
    if (v == null) return '—';
    if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1000) return '$' + Math.round(v).toLocaleString('es-MX');
    return String(v);
  }

  // un control chart por métrica (SVG 260×90)
  function chart(m) {
    var W = 260, T = 18, B = 64, x0 = 40, x1 = 248;
    var serie = m.serie, n = serie.length;
    var vals = serie.filter(function (p) { return p.valor != null; })
      .map(function (p) { return p.valor; });
    var fuera = m.senal === 'fuera';
    var chipCls = m.senal === 'dentro' ? 'dentro' : (fuera ? 'fuera' : '');
    var chipTxt = m.senal === 'dentro' ? 'en régimen'
      : (fuera ? '≠ fuera de régimen' : 'sin historia');

    var svg = '';
    if (vals.length >= 1) {
      // dominio: serie + límites de banda, con margen
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      if (m.banda) { lo = Math.min(lo, m.banda.lim_inf); hi = Math.max(hi, m.banda.lim_sup); }
      if (hi === lo) { hi += 1; lo -= 1; }
      var pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
      var y = function (v) { return T + (B - T) * (hi - v) / (hi - lo); };
      var xAt = function (i) { return n > 1 ? x0 + (x1 - x0) * i / (n - 1) : (x0 + x1) / 2; };

      svg = '<svg viewBox="0 0 ' + W + ' 90" role="img" aria-label="Control ' +
        esc(m.titulo) + '">';
      if (m.banda) {
        var yTop = y(m.banda.lim_sup), yBot = y(m.banda.lim_inf);
        svg += '<rect x="26" y="' + yTop.toFixed(1) + '" width="228" height="' +
          Math.max(2, yBot - yTop).toFixed(1) + '" class="cs-banda"/>';
        svg += '<line x1="26" y1="' + y(m.banda.mediana).toFixed(1) +
          '" x2="254" y2="' + y(m.banda.mediana).toFixed(1) + '" class="cs-mediana"/>';
      }
      // serie
      var pts = serie.map(function (p, i) {
        return p.valor == null ? null : xAt(i).toFixed(1) + ',' + y(p.valor).toFixed(1);
      }).filter(Boolean).join(' ');
      svg += '<polyline points="' + pts + '" class="cs-serie"/>';
      serie.forEach(function (p, i) {
        if (p.valor == null) return;
        if (p.actual) {
          svg += '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + y(p.valor).toFixed(1) +
            '" r="4.2" class="cs-foco' + (fuera ? ' cs-fuera' : '') + '"/>';
        } else {
          svg += '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + y(p.valor).toFixed(1) +
            '" r="2.4" class="cs-pt"/>';
        }
      });
      // etiquetas primera y actual
      svg += '<text x="26" y="80" class="cs-xlab">' + esc(serie[0].etiqueta) + '</text>';
      var ult = serie[serie.length - 1];
      svg += '<text x="248" y="80" text-anchor="end" class="cs-xlab cs-now' +
        (fuera ? ' cs-fuera' : '') + '">' + esc(ult.etiqueta) + '</text>';
      svg += '</svg>';
    }

    var tec = m.banda
      ? ('Banda: mediana ± ' + m.banda.k + '·MAD sobre ' + n + ' sesiones. mín ' +
         fmtCorto(m.banda.min) + ' · máx ' + fmtCorto(m.banda.max) + ' · mediana ' +
         fmtCorto(m.banda.mediana) + '. ' + esc(m.metodo))
      : 'Una sola sesión: sin historia para comparar. La banda aparece con dos o más.';

    return '<div class="cs-card">' +
      '<div class="cs-top"><span class="cs-met">' + esc(m.titulo) + '</span>' +
      '<span class="cs-chip ' + chipCls + '">' + chipTxt + '</span></div>' +
      '<div class="cs-now-v' + (fuera ? ' cs-fuera' : '') + '">' +
      fmtVal(m.actual, m.unidad) + '</div>' + svg +
      '<details class="cs-tec"><summary>ficha técnica</summary><p>' + tec + '</p></details>' +
      '</div>';
  }

  function montar(hostId) {
    var host = document.getElementById(hostId);
    if (!host) return;
    fetch('/api/v1/autogenes/control')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error || !j.metricas) {
          host.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos de control') + '</p>';
          return;
        }
        host.innerHTML = '<div class="cs-grid">' +
          j.metricas.map(chart).join('') + '</div>';
      })
      .catch(function () {
        host.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
      });
  }

  return { montar: montar };
})();
