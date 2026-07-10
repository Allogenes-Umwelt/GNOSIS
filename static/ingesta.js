/* GNOSIS · Ingesta — bandeja de documentos + extracción citada (HITL).
   Flujo: soltar PDF/TXT → el sustrato lo registra como artefacto con
   fragmentos → "extraer" pide la propuesta citada (DeepSeek; quórum de
   dos modelos si el operador lo pide y hay dos disponibles) → el
   operador revisa con checkboxes (las entidades sin acuerdo de quórum
   llegan marcadas) → "integrar" escribe VÍA Sustrato, que vuelve a
   sanear. El dendrograma se recarga tras cada mutación. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var drop = document.getElementById('in-drop');
    var file = document.getElementById('in-file');
    var msj = document.getElementById('in-msj');
    var lista = document.getElementById('in-artefactos');
    var propCont = document.getElementById('in-propuesta');
    var propTitulo = document.getElementById('in-prop-titulo');
    var integrarBtn = document.getElementById('in-integrar');
    var quorumChk = document.getElementById('in-quorum');
    var dendro = document.querySelector('.dn-lienzo');
    var propuestaActual = null;

    function aviso(texto, clase) {
      msj.className = 'ag-msj ' + (clase || '');
      msj.textContent = texto;
    }

    function recargarMapa() {
      if (dendro && dendro.dendroAPI) dendro.dendroAPI.recargar();
    }

    // ── bandeja ──────────────────────────────────────────────────────
    function pintarArtefactos() {
      fetch('/api/v1/autogenes/artefactos')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          lista.innerHTML = '';
          (j.artefactos || []).forEach(function (a) {
            var li = document.createElement('li');
            var enlace = document.createElement('a');
            enlace.href = '#';
            enlace.innerHTML = '<span>' + a.nombre.slice(0, 20) + '</span>' +
              '<span class="dato">' + a.fragmentos + ' frag · ' +
              a.entidades + ' ent · extraer ▸</span>';
            enlace.addEventListener('click', function (ev) {
              ev.preventDefault();
              extraer(a.id, a.nombre);
            });
            li.appendChild(enlace);
            lista.appendChild(li);
          });
          if (!(j.artefactos || []).length) {
            lista.innerHTML = '<li><span class="gr-vacio" style="padding:8px">' +
              'Sin artefactos aún — suelta el primero arriba.</span></li>';
          }
        }).catch(function () {});
    }

    // ── ingesta ──────────────────────────────────────────────────────
    function subir(archivo) {
      var fd = new FormData();
      fd.append('documento', archivo);
      aviso('Ingiriendo ' + archivo.name + '…');
      fetch('/api/v1/autogenes/ingestar', { method: 'POST', body: fd })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { aviso(res.j.error || 'Falló la ingesta', 'error'); return; }
          aviso('Dockeado: ' + res.j.nombre + ' · ' + res.j.fragmentos + ' fragmentos', 'ok');
          pintarArtefactos();
          recargarMapa();
        })
        .catch(function () { aviso('Sin conexión — reintenta', 'error'); });
    }
    file.addEventListener('change', function () {
      if (file.files.length) subir(file.files[0]);
    });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('arrastrando'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('arrastrando'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files.length) subir(e.dataTransfer.files[0]);
    });

    // ── extracción + revisión HITL ───────────────────────────────────
    function extraer(artefactoId, nombre) {
      aviso('Extrayendo de ' + nombre + '…');
      propCont.innerHTML = '';
      propTitulo.hidden = true; integrarBtn.hidden = true;
      fetch('/api/v1/autogenes/extraer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artefacto_id: artefactoId,
                               quorum: quorumChk.checked })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { aviso(res.j.error || 'Falló la extracción', 'error'); return; }
          propuestaActual = res.j;
          aviso(res.j.entidades.length + ' entidades · ' +
                res.j.relaciones.length + ' relaciones · ' +
                (res.j.quorum ? 'QUÓRUM ✓' : 'un modelo'), 'ok');
          pintarPropuesta(res.j);
        })
        .catch(function () { aviso('Sin conexión — reintenta', 'error'); });
    }

    function pintarPropuesta(p) {
      propCont.innerHTML = '';
      p.entidades.forEach(function (e, i) {
        var fila = document.createElement('label');
        fila.className = 'gr-fila';
        fila.style.cursor = 'pointer';
        var marca = e.acuerdo === false ? ' ⚠ sin acuerdo'
                  : e.acuerdo === true ? ' ✓✓' : '';
        fila.innerHTML = '<span><input type="checkbox" data-ent="' + i + '"' +
          (e.acuerdo === false ? '' : ' checked') + '> ' +
          e.nombre.slice(0, 20) + '</span><b>' + e.tipo +
          ' · ' + e.evidencia.length + '📎' + marca + '</b>';
        propCont.appendChild(fila);
      });
      p.relaciones.forEach(function (r, i) {
        var fila = document.createElement('label');
        fila.className = 'gr-fila';
        fila.style.cursor = 'pointer';
        fila.innerHTML = '<span><input type="checkbox" data-rel="' + i + '" checked> ' +
          r.desde.slice(0, 12) + ' → ' + r.hasta.slice(0, 12) +
          '</span><b>' + r.tipo + '</b>';
        propCont.appendChild(fila);
      });
      propTitulo.hidden = false;
      integrarBtn.hidden = false;
      integrarBtn.disabled = false;
    }

    integrarBtn.addEventListener('click', function () {
      if (!propuestaActual) return;
      var entidades = [], relaciones = [];
      propCont.querySelectorAll('input[data-ent]:checked').forEach(function (c) {
        entidades.push(propuestaActual.entidades[+c.dataset.ent]);
      });
      var nombres = {};
      entidades.forEach(function (e) { nombres[e.nombre.toLowerCase()] = true; });
      propCont.querySelectorAll('input[data-rel]:checked').forEach(function (c) {
        var r = propuestaActual.relaciones[+c.dataset.rel];
        if (nombres[r.desde.toLowerCase()] && nombres[r.hasta.toLowerCase()]) {
          relaciones.push(r);
        }
      });
      integrarBtn.disabled = true;
      aviso('Integrando…');
      fetch('/api/v1/autogenes/integrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entidades: entidades, relaciones: relaciones })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { aviso(res.j.error || 'Falló la integración', 'error'); integrarBtn.disabled = false; return; }
          aviso('Integradas ' + res.j.entidades + ' entidades y ' +
                res.j.relaciones + ' relaciones al grafo', 'ok');
          propuestaActual = null;
          propCont.innerHTML = ''; propTitulo.hidden = true; integrarBtn.hidden = true;
          pintarArtefactos();
          recargarMapa();
        })
        .catch(function () { aviso('Sin conexión — reintenta', 'error'); integrarBtn.disabled = false; });
    });

    pintarArtefactos();
  });
})();
