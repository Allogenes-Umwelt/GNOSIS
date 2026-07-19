/* GNOSIS · Qualia — cajón de dossier compartido (Q4 drill-down).
   Cualquier instrumento llama QualiaDossier.abrir(nombre, {nodoId}) y este
   cajón trae el expediente de negocio de la entidad —qué es, qué fragmentos
   la citan (fuente + página), con quién se relaciona, en qué eventos
   aparece, qué productos la anclan— y ofrece el salto a Vínculos. Se
   auto-inyecta en el body (sin tocar plantillas salvo el <script>). La
   selección viaja en ?sel= para que persista al cambiar de pestaña.
   Lectura pura; nada escribe. Datos: /qualia/dossier. */
window.QualiaDossier = (function () {
  'use strict';
  var Q = window.QualiaComun;
  var overlay, panel, cuerpo, titulo, sub, ultimoFoco;

  function esc(s) { return Q ? Q.esc(s) : String(s == null ? '' : s); }

  function construir() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'qd-overlay'; overlay.hidden = true;
    panel = document.createElement('aside');
    panel.className = 'qd-panel'; panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Dossier de la entidad');
    panel.innerHTML =
      '<div class="qd-head"><div><div class="qd-kicker">DOSSIER</div>' +
      '<h2 class="qd-titulo"></h2><div class="qd-sub"></div></div>' +
      '<button type="button" class="qd-cerrar" aria-label="Cerrar dossier">×</button></div>' +
      '<div class="qd-cuerpo"></div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    cuerpo = panel.querySelector('.qd-cuerpo');
    titulo = panel.querySelector('.qd-titulo');
    sub = panel.querySelector('.qd-sub');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(); });
    panel.querySelector('.qd-cerrar').addEventListener('click', cerrar);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) cerrar();
    });
  }

  function sec(t) { return '<div class="qd-sec">' + esc(t) + '</div>'; }

  function render(j, opts) {
    if (j.error) {
      cuerpo.innerHTML = '<p class="qa-base-hint">' + esc(j.error) + '</p>';
      return;
    }
    if (j.ambiguo) {
      var lis = (j.candidatos || []).map(function (c) {
        return '<button type="button" class="qd-cand" data-n="' + esc(c.nombre) +
          '">' + esc(c.nombre) + ' · ' + esc(c.tipo || '') + '</button>';
      }).join('');
      cuerpo.innerHTML = sec('Varias entidades coinciden') +
        '<div class="qd-cands">' + lis + '</div>';
      cuerpo.querySelectorAll('.qd-cand').forEach(function (b) {
        b.addEventListener('click', function () { abrir(b.getAttribute('data-n'), opts); });
      });
      return;
    }
    var e = j.entidad || {};
    titulo.textContent = e.nombre || '—';
    sub.textContent = (e.tipo || '') + (e.origen ? ' · ' + e.origen : '');
    var h = '';
    if (e.resumen) h += '<p class="qd-resumen">' + esc(e.resumen) + '</p>';
    if ((j.citas || []).length) {
      h += sec('Citas (' + j.total_citas + ')');
      j.citas.forEach(function (c) {
        h += '<div class="qd-cita"><span class="fuente">' + esc(c.fuente) +
          (c.pagina != null ? ' · p.' + esc(c.pagina) : '') + '</span>' +
          '<span class="ext">' + esc(c.extracto || '') + '</span></div>';
      });
    }
    if ((j.relaciones || []).length) {
      h += sec('Relaciones');
      j.relaciones.slice(0, 10).forEach(function (r) {
        h += '<div class="qd-rel"><span class="dir">' +
          (r.direccion === 'sale' ? '→' : '←') + '</span><span class="con">' +
          esc(r.con) + '</span><span class="tipo">' + esc(r.tipo) + '</span></div>';
      });
    }
    if ((j.eventos || []).length) {
      h += sec('Eventos');
      j.eventos.slice(0, 6).forEach(function (ev) {
        h += '<div class="qd-ev"><b>' + esc(ev.titulo) + '</b>' +
          (ev.fecha ? ' · ' + esc(ev.fecha) : '') + '</div>';
      });
    }
    if ((j.productos || []).length) {
      h += sec('Productos que la anclan');
      j.productos.forEach(function (p) {
        h += '<div class="qd-prod">' + esc(p.titulo) +
          ' <span class="clase">' + esc(p.clase || '') + '</span></div>';
      });
    }
    var nid = opts && opts.nodoId;
    h += '<div class="qd-saltos">';
    if (nid) {
      h += '<a class="qd-salto" href="/autogenes/grafo#n=' +
        encodeURIComponent(nid) + '">ver en Vínculos →</a>';
    }
    h += '</div>';
    cuerpo.innerHTML = h;
  }

  function ponerSel(nombre) {
    try {
      var u = new URL(window.location.href);
      if (nombre) u.searchParams.set('sel', nombre); else u.searchParams.delete('sel');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch { /* algunos entornos bloquean replaceState */ }
    parcharPestanas(nombre);
  }
  // Las pestañas cargan ?sel para que la selección persista al cambiar de
  // instrumento (el instrumento destino la auto-abre).
  function parcharPestanas(nombre) {
    document.querySelectorAll('.qa-tabs a').forEach(function (a) {
      try {
        var u = new URL(a.href, window.location.origin);
        if (nombre) u.searchParams.set('sel', nombre); else u.searchParams.delete('sel');
        a.href = u.pathname + u.search;
      } catch { /* ignora */ }
    });
  }

  function abrir(nombre, opts) {
    if (!nombre) return;
    construir();
    // solo al abrir de verdad: reabrir desde un candidato del propio panel no
    // debe capturar un botón que render() destruirá (foco perdido al cerrar).
    if (overlay.hidden) ultimoFoco = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('qd-abierto');
    titulo.textContent = nombre; sub.textContent = '';
    cuerpo.innerHTML = '<div class="sp-scan" aria-hidden="true" style="margin:20px auto"></div>';
    panel.querySelector('.qd-cerrar').focus();
    ponerSel(nombre);
    fetch('/api/v1/autogenes/qualia/dossier?nombre=' + encodeURIComponent(nombre))
      .then(function (r) {
        // distingue "el sustrato respondió con error" de "no hubo conexión"
        if (!r.ok) throw new Error('http');
        return r.json();
      })
      .then(function (j) { render(j, opts || {}); })
      .catch(function (err) {
        cuerpo.innerHTML = '<p class="qa-base-hint">' +
          (err && err.message === 'http'
            ? 'No se pudo leer el dossier.'
            : 'Sin conexión con el sustrato.') + '</p>';
      });
  }
  function cerrar() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('qd-abierto');
    ponerSel(null);
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  // deep-link: ?sel=<nombre> auto-abre (selección compartida entre pestañas)
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var sel = new URL(window.location.href).searchParams.get('sel');
      if (sel) { parcharPestanas(sel); abrir(sel, {}); }
    } catch { /* ignora */ }
  });

  return { abrir: abrir, cerrar: cerrar };
})();
