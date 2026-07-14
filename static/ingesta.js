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
    var chord = document.querySelector('.ch-lienzo');
    var extraerTodoBtn = document.getElementById('in-extraer-todo');
    var cancelarBtn = document.getElementById('in-cancelar');
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
      if (chord && chord.chordAPI) chord.chordAPI.recargar();
    }

    // ── panel derecho: resumen por defecto (mata la pantalla muerta) ──
    // Gramática de tarjeta: cifra+unidad+periodo → so-what → now-what → fuente.
    function pintarResumen() {
      propTitulo.hidden = true; integrarBtn.hidden = true;
      fetch('/api/v1/autogenes/chord_ingesta')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) { propCont.innerHTML = ''; return; }
          var r = j.resumen;
          var ahora = r.frias
            ? 'Extrae las ' + r.frias + ' frías o suelta más fuentes.'
            : 'Todas las fuentes citadas — suelta nuevas o sintetiza.';
          propCont.innerHTML =
            '<div class="gr-kind">' + esc(j.etiqueta) + '</div>' +
            '<div class="gr-fila"><span>Cobertura</span><b>' + esc(r.cobertura) +
              '% · ' + esc(r.citados) + '/' + esc(r.fragmentos) + ' frag</b></div>' +
            '<div class="gr-fila"><span>Fuentes</span><b>' + esc(r.fuentes) +
              ' · ' + esc(r.frias) + ' frías</b></div>' +
            '<div class="gr-fila"><span>Entidades</span><b>' + esc(r.entidades) + '</b></div>' +
            '<p class="gr-vacio" style="margin-top:10px">' + esc(ahora) +
            ' · clic en un arco para su dossier.</p>';
        }).catch(function () {});
    }

    // ── dossier de un arco (artefacto o entidad) ──
    function pintarDossier(nodo) {
      if (!nodo || nodo.agregado) { pintarResumen(); return; }
      propTitulo.hidden = true; integrarBtn.hidden = true;
      propCont.innerHTML = '<p class="gr-vacio">Cargando dossier…</p>';
      fetch('/api/v1/autogenes/detalle_ingesta?id=' + encodeURIComponent(nodo.id))
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { propCont.innerHTML = '<p class="gr-vacio">' +
            esc(res.j.error || 'Sin dossier') + '</p>'; return; }
          var d = res.j;
          if (d.tipo === 'artefacto') { dossierArtefacto(d); }
          else { dossierEntidad(d); }
        }).catch(function () {
          propCont.innerHTML = '<p class="gr-vacio">Sin conexión</p>';
        });
    }

    function dossierArtefacto(d) {
      var html = '<div class="gr-kind">' + (d.fria ? 'FRÍA · ' : '') +
        esc(d.kind.toUpperCase()) + ' · ' + esc(d.fragmentos.length) + ' frag</div>' +
        '<div class="gr-fila"><span>' + esc(d.nombre.slice(0, 26)) + '</span><b>' +
        esc(d.citantes.length) + ' citante(s)</b></div>';
      d.citantes.forEach(function (c) {
        html += '<div class="gr-fila"><a href="/autogenes/grafo#n=' +
          encodeURIComponent(c.id) + '"><span>' + esc(c.nombre.slice(0, 22)) +
          '</span><b>' + esc(c.tipo) + '</b></a></div>';
      });
      html += '<div class="ag-grupo" style="margin-top:8px">Fragmentos</div>';
      d.fragmentos.slice(0, 8).forEach(function (f) {
        html += '<details class="in-frag"><summary>' +
          (f.pagina ? 'p. ' + esc(f.pagina) : 'fragmento') + '</summary><p>' +
          esc((f.texto || '').slice(0, 600)) + '</p></details>';
      });
      propCont.innerHTML = html;
      // botón extraer: reusa el flujo HITL existente
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ag-subir'; b.textContent = d.fria
        ? 'Extraer (fuente fría)' : 'Extraer de nuevo';
      b.addEventListener('click', function () { extraer(d.id, d.nombre); });
      propCont.appendChild(b);
    }

    function dossierEntidad(d) {
      var html = '<div class="gr-kind">' + esc((d.tipo_ent || 'entidad').toUpperCase()) +
        '</div><div class="gr-fila"><a href="/autogenes/grafo#n=' +
        encodeURIComponent(d.id) + '"><span>' + esc(d.nombre.slice(0, 24)) +
        '</span><b>ver en grafo ▸</b></a></div>';
      if (d.resumen) html += '<p class="gr-vacio">' + esc(d.resumen.slice(0, 240)) + '</p>';
      html += '<div class="ag-grupo" style="margin-top:8px">Fuentes que la sustentan</div>';
      (d.fuentes || []).forEach(function (a) {
        html += '<div class="gr-fila"><span>' + esc(a.nombre.slice(0, 22)) +
          '</span><b>' + esc(a.kind) + '</b></div>';
      });
      if (!d.fuentes || !d.fuentes.length) {
        html += '<p class="gr-vacio">Sin fuente citada.</p>';
      }
      propCont.innerHTML = html;
    }

    if (chord) chord.addEventListener('chord-select', function (ev) {
      pintarDossier(ev.detail);
    });
    pintarResumen();

    // ── bandeja: frías primero, filtrables, nombres sin recortar ──────
    var soloFrias = document.getElementById('in-solo-frias');
    function pintarLista() {
      var solo = soloFrias && soloFrias.checked;
      // orden estable: frías primero (la señal accionable), luego como vino
      var arte = artefactosCache.slice().sort(function (a, b) {
        return (b.fria ? 1 : 0) - (a.fria ? 1 : 0);
      }).filter(function (a) { return !solo || a.fria; });
      lista.innerHTML = '';
      arte.forEach(function (a) {
        var li = document.createElement('li');
        if (a.fria) li.className = 'in-fria';
        var enlace = document.createElement('a');
        enlace.href = '#';
        enlace.title = a.nombre;    // nombre completo en el tooltip (sin recorte)
        enlace.innerHTML = '<span class="in-nom">' + esc(a.nombre) + '</span>' +
          '<span class="dato">' + esc(a.fragmentos) + ' frag · ' +
          (a.fria ? '<b class="in-frio">fría</b>' : esc(a.entidades) + ' ent') +
          ' · extraer ▸</span>';
        enlace.addEventListener('click', function (ev) {
          ev.preventDefault();
          extraer(a.id, a.nombre);
        });
        li.appendChild(enlace);
        lista.appendChild(li);
      });
      if (!arte.length) {
        lista.innerHTML = '<li><span class="gr-vacio" style="padding:8px">' +
          (solo ? 'Ninguna fuente fría.' : 'Sin artefactos aún — suelta el primero arriba.') +
          '</span></li>';
      }
      if (extraerTodoBtn) extraerTodoBtn.hidden = artefactosCache.length < 2;
    }
    if (soloFrias) soloFrias.addEventListener('change', pintarLista);

    function pintarArtefactos() {
      return fetch('/api/v1/autogenes/artefactos')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          artefactosCache = j.artefactos || [];
          pintarLista();
        }).catch(function () {});
    }

    // ── ingesta ──────────────────────────────────────────────────────
    // enLote=1 difiere el snapshot QUALIA (lo dispara telemetria/snapshot al
    // cerrar el lote): hacerlo por archivo es O(n^2) en una carpeta grande.
    function subirUno(archivo, enLote) {
      var fd = new FormData();
      fd.append('documento', archivo);
      if (enLote) fd.append('lote', '1');
      return fetch('/api/v1/autogenes/ingestar', { method: 'POST', body: fd })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
    }
    function cerrarLote() {   // un solo snapshot al terminar la carga masiva
      return fetch('/api/v1/autogenes/telemetria/snapshot', { method: 'POST' })
        .catch(function () {});
    }
    // Cola secuencial: varios PDFs (o una carpeta soltada) entran uno por
    // uno para no saturar el servidor ni perder el orden de dockeo. El
    // operador puede cancelar: se detiene en el siguiente archivo (el que ya
    // entró, quedó; re-soltar la carpeta reanuda por dedupe de contenido).
    var ACEPTA = /\.(pdf|txt|md|xml|csv|xls|xlsx|zip|jpe?g|png|gif|bmp|webp|tiff?|heic)$/;
    var enCola = false;
    var cancelado = false;
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
      enCola = true; cancelado = false;
      var ok = 0, err = 0, dup = 0, total = aceptados.length;
      var enLote = total > 1;   // un archivo suelto conserva su snapshot inmediato
      if (enLote && cancelarBtn) cancelarBtn.hidden = false;
      function resumen(hechos) {
        return hechos + '/' + total + ' · ' + ok + ' dockeado(s)' +
               (dup ? ' · ' + dup + ' duplicado(s)' : '') +
               (err ? ' · ' + err + ' con error' : '');
      }
      function terminar(i, porCancelacion) {
        enCola = false;
        if (cancelarBtn) cancelarBtn.hidden = true;
        var restantes = total - i;
        aviso(porCancelacion
          ? 'Carga cancelada · ' + resumen(i) +
            (restantes ? ' · ' + restantes + ' sin procesar (re-suelta para reanudar)' : '')
          : 'Ingesta lista · ' + resumen(total),
          (err && !porCancelacion) ? 'error' : 'ok');
        // un solo redibujo (y un solo snapshot) al cerrar el lote — no O(archivos)
        var fin = enLote ? cerrarLote() : Promise.resolve();
        fin.then(function () { pintarArtefactos(); recargarMapa(); });
      }
      (function siguiente(i) {
        if (cancelado) { terminar(i, true); return; }
        if (i >= total) { terminar(total, false); return; }
        aviso('Ingiriendo ' + (i + 1) + '/' + total + ' · ' +
              aceptados[i].name.slice(0, 24) + '… (' + resumen(i) + ')');
        subirUno(aceptados[i], enLote).then(function (res) {
          // un ZIP devuelve un resumen de lote; un archivo suelto, uno solo
          if (res.ok) { ok += (res.j.lote ? res.j.ingeridos : 1); dup += (res.j.duplicados || 0); }
          else if (res.j && res.j.duplicado) { dup++; }
          else { err++; }
          siguiente(i + 1);
        }).catch(function () { err++; siguiente(i + 1); });
      })(0);
    }
    if (cancelarBtn) {
      cancelarBtn.addEventListener('click', function () {
        cancelado = true;
        cancelarBtn.disabled = true;
        aviso('Cancelando al terminar el archivo en curso…');
        setTimeout(function () { cancelarBtn.disabled = false; }, 1500);
      });
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
        aviso('Extrayendo ' + (i + 1) + '/' + total + ' · ' +
              cola[i].nombre.slice(0, 24) + '…');
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
        // merge-preview: si ya existe, integrarla suma evidencia, no crea nodo
        var merge = e.nueva === false ? '<i class="in-existe">ya existe</i>'
                  : '<i class="in-nueva">nueva</i>';
        fila.innerHTML = '<span><input type="checkbox" data-ent="' + i + '"' +
          (e.acuerdo === false ? '' : ' checked') + '> ' +
          esc(e.nombre.slice(0, 20)) + ' ' + merge + '</span><b>' + esc(e.tipo) +
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
          propTitulo.hidden = true; integrarBtn.hidden = true;
          pintarArtefactos();
          recargarMapa();
          pintarResumen();
        })
        .catch(function () { aviso('Sin conexión — reintenta', 'error'); integrarBtn.disabled = false; });
    });

    pintarArtefactos();
  });
})();
