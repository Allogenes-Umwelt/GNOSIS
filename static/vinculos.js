/* GNOSIS · Vínculos — caminos citados sobre el lienzo del caso.
   Cabalga el componente grafo.js vía su grafoAPI: traza el camino más
   corto entre dos nodos (el servidor lo computa sobre NetworkX y cada
   salto llega con sus citas), lo resalta en el lienzo atenuando el
   resto, lista los saltos con su evidencia, y lo dockea como
   Producto{clase:'camino'} — recomputado en servidor, jamás dictado
   por el cliente. Los hubs del caso son atajos de foco. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var lienzo = document.querySelector('.gr-lienzo');
    if (!lienzo) return;

    var desdeIn = document.getElementById('vn-desde');
    var hastaIn = document.getElementById('vn-hasta');
    var lista = document.getElementById('vn-nodos');
    var panel = document.getElementById('vn-camino');
    var dockear = document.getElementById('vn-dockear');
    var msj = document.getElementById('vn-msj');
    var hubsUl = document.getElementById('vn-hubs');

    var porEtiqueta = {};
    var caminoActual = null;
    var reqSeq = 0;   // una respuesta vieja nunca fija caminoActual

    // Etiquetas de origen documental: SIEMPRE escapadas antes del DOM.
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    lienzo.addEventListener('grafo:listo', function (ev) {
      lista.innerHTML = '';
      porEtiqueta = {};
      ev.detail.nodos.forEach(function (n) {
        if (n.kind === 'fragmento') return;
        var clave = n.etiqueta + ' · ' + n.kind;
        porEtiqueta[clave.toLowerCase()] = n.id;
        porEtiqueta[n.etiqueta.toLowerCase()] = porEtiqueta[n.etiqueta.toLowerCase()] || n.id;
        var op = document.createElement('option');
        op.value = clave;
        lista.appendChild(op);
      });
    });

    function idDe(texto) {
      return porEtiqueta[(texto || '').trim().toLowerCase()] || null;
    }

    function pintarCamino(cam) {
      panel.innerHTML = '';
      var cab = document.createElement('div');
      cab.className = 'gr-kind';
      cab.textContent = cam.largo + ' SALTOS · ' + cam.evidencia.length + ' CITAS';
      panel.appendChild(cab);
      cam.saltos.forEach(function (s) {
        var fila = document.createElement('div');
        fila.className = 'gr-fila';
        fila.innerHTML = '<span>' + esc((s.de.etiqueta || '').slice(0, 16)) + ' → ' +
          esc((s.a.etiqueta || '').slice(0, 16)) + '</span><b>' +
          esc(s.arista.tipo || s.arista.kind || '—') +
          (s.evidencia.length ? ' · ' + s.evidencia.length + ' citas' : '') + '</b>';
        panel.appendChild(fila);
      });
    }

    function trazar() {
      var a = idDe(desdeIn.value), b = idDe(hastaIn.value);
      msj.className = 'ag-msj';
      if (!a || !b) { msj.textContent = 'Elige ambos extremos de la lista.'; return; }
      msj.textContent = 'Trazando…';
      var mia = ++reqSeq;
      fetch('/api/v1/autogenes/camino?desde=' + encodeURIComponent(a) +
            '&hasta=' + encodeURIComponent(b))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (mia !== reqSeq) return;
          if (!j.camino) {
            msj.textContent = j.mensaje || j.error || 'Sin camino.';
            caminoActual = null; dockear.disabled = true;
            if (lienzo.grafoAPI) lienzo.grafoAPI.limpiar();
            panel.innerHTML = '<p class="gr-vacio">No existe camino entre esos nodos.</p>';
            return;
          }
          caminoActual = { desde_id: a, hasta_id: b };
          msj.textContent = '';
          dockear.disabled = false;
          pintarCamino(j.camino);
          if (lienzo.grafoAPI) {
            var nodos = [j.camino.desde.id];
            var enlaces = [];
            j.camino.saltos.forEach(function (s) {
              nodos.push(s.a.id); nodos.push(s.de.id);
              if (s.arista && s.arista.id) enlaces.push(s.arista.id);
            });
            lienzo.grafoAPI.resaltar(nodos, enlaces);
          }
        })
        .catch(function () {
          if (mia !== reqSeq) return;
          msj.textContent = 'Sin conexión con el sustrato.';
        });
    }

    document.getElementById('vn-trazar').addEventListener('click', trazar);
    [desdeIn, hastaIn].forEach(function (inp) {
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); trazar(); }
      });
    });
    document.getElementById('vn-limpiar').addEventListener('click', function () {
      caminoActual = null; dockear.disabled = true;
      desdeIn.value = ''; hastaIn.value = ''; msj.textContent = '';
      panel.innerHTML = '<p class="gr-vacio">Elige origen y destino, y traza.</p>';
      if (lienzo.grafoAPI) lienzo.grafoAPI.limpiar();
    });

    dockear.addEventListener('click', function () {
      if (!caminoActual) return;
      dockear.disabled = true;
      msj.className = 'ag-msj'; msj.textContent = 'Dockeando…';
      fetch('/api/v1/autogenes/camino/dockear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caminoActual)
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          msj.className = 'ag-msj ' + (res.ok ? 'ok' : 'error');
          msj.textContent = res.ok ? 'Dockeado: ' + res.j.titulo
                                   : (res.j.error || 'No se pudo dockear');
          dockear.disabled = res.ok;
          if (res.ok) caminoActual = null;   // evita doble-dock del mismo camino
        })
        .catch(function () {
          msj.className = 'ag-msj error';
          msj.textContent = 'Sin conexión — reintenta';
          dockear.disabled = false;
        });
    });

    // hubs: atajos de foco
    fetch('/api/v1/autogenes/hubs?top=8')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        (j.hubs || []).forEach(function (h) {
          var li = document.createElement('li');
          var a = document.createElement('a');
          a.href = '#';
          a.innerHTML = '<span>' + esc(h.etiqueta.slice(0, 22)) + '</span><span class="dato">' +
                        esc(h.kind) + ' · ' + esc(h.grado) + '</span>';
          a.addEventListener('click', function (ev) {
            ev.preventDefault();
            if (lienzo.grafoAPI) lienzo.grafoAPI.enfocar(h.id);
            if (!desdeIn.value) desdeIn.value = h.etiqueta + ' · ' + h.kind;
            else if (!hastaIn.value) hastaIn.value = h.etiqueta + ' · ' + h.kind;
          });
          li.appendChild(a);
          hubsUl.appendChild(li);
        });
      }).catch(function () {});
  });
})();
