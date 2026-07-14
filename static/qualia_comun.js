/* GNOSIS · Qualia — helpers compartidos de lienzo (Q3 del uplift).
   La auditoría encontró esc/alfa/leerColores/tamaño/brackets duplicados
   en los siete instrumentos, con fallbacks hex divergentes que sólo
   encajaban en Nocturne. Esta es su única casa: cada instrumento la
   adopta al rediseñarse. Sin estado propio — funciones puras sobre el
   documento y el contexto que se le pasan. Tokens de styles.css; los
   fallbacks son POR TEMA (no la paleta oscura hardcodeada de antes). */
window.QualiaComun = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function alfa(hex, a) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length < 6) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
           ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }

  // Lee los tokens vivos; si el CSS aún no cargó, cae al fallback DEL TEMA
  // activo (no siempre el oscuro) — así un fallo de token no pinta Nocturne
  // sobre Daylight.
  function leerColores() {
    var cs = getComputedStyle(document.documentElement);
    var claro = document.documentElement.getAttribute('data-theme') === 'light';
    function tok(nombre, oscuro, luz) {
      return cs.getPropertyValue(nombre).trim() || (claro ? luz : oscuro);
    }
    return {
      acc: tok('--acc-text', '#00D4FF', '#005A6E'),
      danger: tok('--danger', '#F57F9C', '#A4133C'),
      linea: tok('--line', '#5B5B5B', '#919191'),
      t1: tok('--t1', '#FAFAF8', '#030303'),
      t3: tok('--t3', '#AAAAAA', '#474747'),
      fondo: tok('--surface', '#0A0A0A', '#F8F8F6'),
      bg: tok('--bg', '#050505', '#FAFAF8')
    };
  }

  // Ajusta el backing store a DPR; devuelve el tamaño CSS {w, h}.
  function medir(canvas, ctx, minAlto) {
    var caja = canvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var alto = Math.max(minAlto || 420, caja.height);
    canvas.width = Math.max(1, caja.width * dpr);
    canvas.height = alto * dpr;
    canvas.style.height = alto + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: caja.width, h: alto };
  }

  // Corchetes de esquina (lenguaje databook), a 8px del borde.
  function brackets(ctx, w, h, color) {
    ctx.save();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    [[8, 8, 22, 8, 8, 22], [w - 8, 8, w - 22, 8, w - 8, 22],
     [8, h - 8, 22, h - 8, 8, h - 22], [w - 8, h - 8, w - 22, h - 8, w - 8, h - 22]]
      .forEach(function (c) {
        ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
        ctx.lineTo(c[4], c[5]); ctx.stroke();
      });
    ctx.restore();
  }

  // Re-lee tokens y redibuja ~60ms tras alternar tema (el toggle cambia las
  // variables CSS después del click).
  function alTema(redibujar) {
    var t = document.getElementById('theme-toggle');
    if (t) t.addEventListener('click', function () { setTimeout(redibujar, 60); });
  }

  return { esc: esc, alfa: alfa, leerColores: leerColores, medir: medir,
           brackets: brackets, alTema: alTema };
})();
