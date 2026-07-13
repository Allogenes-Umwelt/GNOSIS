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
    var extraerTodoBtn = document.getElementById('in-extraer-todo');
    var propuestaActual = null;
    var extraccionEnVuelo = false;   // un doble clic no debe costar dos extracciones
    var artefactosCache = [];        // último listado, para "extraer todo"

    // Nombres de archivo y salida del modelo: SIEMPRE escapados antes del DOM.
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

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
          artefactosCache = j.artefactos || [];
          lista.innerHTML = '';
          artefactosCache.forEach(function (a) {
            var li = document.createElement('li');
            var enlace = document.createElement('a');
            enlace.href = '#';
            enlace.innerHTML = '<span>' + esc(a.nombre.slice(0, 20)) + '</span>' +
              '<span class="dato">' + esc(a.fragmentos) + ' frag · ' +
              esc(a.entidades) + ' ent · extraer ▸</span>';
            enlace.addEventListener('click', function (ev) {
              ev.preventDefault();
              extraer(a.id, a.nombre);
            });
            li.appendChild(enlace);
            lista.appendChild(li);
          });
          if (!artefactosCache.length) {
            lista.innerHTML = '<li><span class="gr-vacio" style="padding:8px">' +
              'Sin artefactos aún — suelta el primero arriba.</span></li>';
          }
          // "Extraer todo" solo tiene sentido con 2+ artefactos
          if (extraerTodoBtn) extraerTodoBtn.hidden = artefactosCache.length < 2;
        }).catch(function () {});
    }

    // ── ingesta ──────────────────────────────────────────────────────
    function subirUno(archivo) {
      var fd = new FormData();
      fd.append('documento', archivo);
      return fetch('/api/v1/autogenes/ingestar', { method: 'POST', body: fd })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
    }
    // Cola secuencial: varios PDFs (o una carpeta soltada) entran uno por
    // uno para no saturar el servidor ni perder el orden de dockeo.
    // Imágenes y PDFs escaneados entran vía OCR en el servidor (Tesseract).
    var ACEPTA = /\.(pdf|txt|md|xml|csv|xls|xlsx|zip|jpe?g|png|gif|bmp|webp|tiff?|heic)$/;
    var enCola = false;
    function subirLote(archivos) {
      var aceptados = [];
      for (var i = 0; i < archivos.length; i++) {
        var n = (archivos[i].name || '').toLowerCase();
        if (ACEPTA.test(n)) aceptados.push(archivos[i]);
      }
      if (!aceptados.length) {
        aviso('Usa PDF, imagen (jpg/png), TXT, XML, Excel o ZIP', 'error');
        return;
      }
      if (enCola) return;
      enCola = true;
      var ok = 0, err = 0, total = aceptados.length;
      (function siguiente(i) {
        if (i >= total) {
          enCola = false;
          aviso('Ingesta lista · ' + ok + ' dockeado(s)' +
                (err ? ' · ' + err + ' con error' : ''), err ? 'error' : 'ok');
          pintarArtefactos(); recargarMapa();
          return;
        }
        aviso('Ingiriendo ' + (i + 1) + '/' + total + ' · ' + aceptados[i].name + '…');
        subirUno(aceptados[i]).then(function (res) {
          // un ZIP devuelve un resumen de lote; un archivo suelto, uno solo
          if (res.ok) { ok += (res.j.lote ? res.j.ingeridos : 1); }
          else { err++; }
          if (res.ok) { pintarArtefactos(); recargarMapa(); }
          siguiente(i + 1);
        }).catch(function () { err++; siguiente(i + 1); });
      })(0);
    }
    file.addEventListener('change', function () {
      if (file.files.length) subirLote(file.files);
      file.value = '';   // re-elegir el mismo archivo vuelve a disparar change
    });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('arrastrando'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('arrastrando'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files.length) subirLote(e.dataTransfer.files);
    });

    // ── extracción + revisión HITL ───────────────────────────────────
    function extraer(artefactoId, nombre) {
      if (extraccionEnVuelo) return;   // no duplicar el costo del modelo
      extraccionEnVuelo = true;
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
          extraccionEnVuelo = false;
          if (!res.ok) { aviso(res.j.error || 'Falló la extracción', 'error'); return; }
          propuestaActual = res.j;
          aviso(res.j.entidades.length + ' entidades · ' +
                res.j.relaciones.length + ' relaciones · ' +
                (res.j.quorum ? 'QUÓRUM ✓' : 'un modelo'), 'ok');
          pintarPropuesta(res.j);
        })
        .catch(function () {
          extraccionEnVuelo = false;
          aviso('Sin conexión — reintenta', 'error');
        });
    }

    // ── extraer TODOS los artefactos en cola, propuesta combinada ──────
    function extraerTodo() {
      if (extraccionEnVuelo || !artefactosCache.length) return;
      var cola = artefactosCache.slice();
      var combinada = { entidades: [], relaciones: [], quorum: true };
      extraccionEnVuelo = true;
      if (extraerTodoBtn) { extraerTodoBtn.disabled = true; }
      propCont.innerHTML = ''; propTitulo.hidden = true; integrarBtn.hidden = true;
      var total = cola.length;
      (function siguiente(i) {
        if (i >= total) {
          extraccionEnVuelo = false;
          if (extraerTodoBtn) extraerTodoBtn.disabled = false;
          propuestaActual = combinada;
          aviso('Extracción de ' + total + ' artefactos · ' +
                combinada.entidades.length + ' entidades · ' +
                combinada.relaciones.length + ' relaciones', 'ok');
          if (combinada.entidades.length || combinada.relaciones.length) {
            pintarPropuesta(combinada);
          } else {
            propCont.innerHTML = '<p class="gr-vacio">Ningún artefacto propuso ' +
              'entidades citables.</p>';
          }
          return;
        }
        aviso('Extrayendo ' + (i + 1) + '/' + total + ' · ' + cola[i].nombre + '…');
        fetch('/api/v1/autogenes/extraer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artefacto_id: cola[i].id, quorum: quorumChk.checked })
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            if (res.ok && res.j.entidades) {
              combinada.entidades = combinada.entidades.concat(res.j.entidades);
              combinada.relaciones = combinada.relaciones.concat(res.j.relaciones || []);
              if (!res.j.quorum) combinada.quorum = false;
            }
            siguiente(i + 1);
          }).catch(function () { siguiente(i + 1); });
      })(0);
    }
    if (extraerTodoBtn) extraerTodoBtn.addEventListener('click', extraerTodo);

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
          esc(e.nombre.slice(0, 20)) + '</span><b>' + esc(e.tipo) +
          ' · ' + e.evidencia.length + ' citas' + marca + '</b>';
        propCont.appendChild(fila);
      });
      p.relaciones.forEach(function (r, i) {
        var fila = document.createElement('label');
        fila.className = 'gr-fila';
        fila.style.cursor = 'pointer';
        fila.innerHTML = '<span><input type="checkbox" data-rel="' + i + '" checked> ' +
          esc(r.desde.slice(0, 12)) + ' → ' + esc(r.hasta.slice(0, 12)) +
          '</span><b>' + esc(r.tipo) + '</b>';
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
