/* GNOSIS · SINAPSIS (F11, SNP-03) — insights por recombinación
   verificada. Cada tarjeta pinta la cadena de composición completa:
   hecho del motor A + hecho del motor B ⇒ lectura, con la gravedad
   DERIVADA de medidas de los componentes. Sin conjunción no hay
   insight y se dice. Datos: /api/v1/autogenes/sinapsis. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var elLista = document.getElementById('sn-insights');

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function refTexto(r) {
      return Object.keys(r).map(function (k) {
        var v = r[k];
        return esc(k) + ' ' + esc(Array.isArray(v) ? v.join(', ') : v);
      }).join(' · ');
    }

    fetch('/api/v1/autogenes/sinapsis')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elLista.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        if (!j.insights.length) {
          elLista.innerHTML = '<p class="qa-base-hint">Ninguna conjunción ' +
            'entre motores por ahora — los ' + j.motores.length + ' motores ' +
            'consultados no comparten protagonistas. Eso también es un ' +
            'hecho, no un fallo.</p>';
          return;
        }
        var html = '';
        j.insights.forEach(function (ins) {
          html += '<article class="sn-tarjeta">' +
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
            '<a href="' + esc(ins.accion) + '">actuar →</a></div>';
          if ((ins.refs || []).length) {
            html += '<div class="sn-refs">' +
              ins.refs.map(refTexto).join('  ·  ') + '</div>';
          }
          html += '</article>';
        });
        elLista.innerHTML = html;
      })
      .catch(function () {
        elLista.innerHTML = '<p class="qa-base-hint">Sin conexión con el sustrato.</p>';
      });
  });
})();
