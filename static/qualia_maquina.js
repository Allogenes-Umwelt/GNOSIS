/* GNOSIS · Qualia — Máquina de inteligencia (F7d, cockpit C2).
   Las cuatro ventanas OODA auto-procesadas: cada titular es salida del
   motor — anomalías medidas (Observar), el monolito por centralidad
   (Orientar), los puentes de articulación como blancos del what-if
   (Decidir) y el último delta de telemetría (Actuar). Cada ventana abre
   su instrumento completo. "Leer el sistema": el modelo interpreta el
   digesto YA calculado y el saneador poda en servidor toda lectura que
   cite una clave no enviada. CERO snake oil: sin datos, cada ventana
   dice por qué. Datos: /qualia/estado, /qualia/red, /qualia/narrativa. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var elObsT = document.getElementById('qm-obs-titular');
    var elObsD = document.getElementById('qm-obs-dato');
    var elOriT = document.getElementById('qm-ori-titular');
    var elOriD = document.getElementById('qm-ori-dato');
    var elDecT = document.getElementById('qm-dec-titular');
    var elDecD = document.getElementById('qm-dec-dato');
    var elActT = document.getElementById('qm-act-titular');
    var elActD = document.getElementById('qm-act-dato');
    var elParte = document.getElementById('qm-parte-cuerpo');
    var btnLeer = document.getElementById('qm-leer');
    var btnDockear = document.getElementById('qm-dockear');
    var elMsj = document.getElementById('qm-msj');
    var ultimaNarrativa = null;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function signo(n) { return n > 0 ? '+' + n : String(n); }

    // ── OBSERVAR + ACTUAR: /qualia/estado ────────────────────────────
    fetch('/api/v1/autogenes/qualia/estado')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) return;
        var hallazgos = j.hallazgos || [];
        var vObs = document.getElementById('qm-observar');
        if (hallazgos.length) {
          vObs.className = 'qm-ventana alerta';
          elObsT.className = 'qm-titular alerta';
          elObsT.textContent = hallazgos.length +
            (hallazgos.length === 1 ? ' desviación medida' : ' desviaciones medidas');
          var top = hallazgos[0];
          elObsD.innerHTML = 'La más severa: <b>' + esc(top.titulo) + '</b> (' +
            Math.round(top.severidad * 100) + '%). ' + esc(top.detalle);
        } else if (j.base) {
          elObsT.textContent = 'Terreno plano';
          elObsD.textContent = 'Sin desviaciones contra tu referencia — nada de placebo.';
        } else {
          elObsT.textContent = 'Sin referencia';
          elObsD.textContent = j.motivo ||
            'Fija la base en el Terreno para que haya contra qué medir.';
        }

        var snaps = j.snapshots || [];
        var vAct = document.getElementById('qm-actuar');
        if (snaps.length >= 2) {
          var a = snaps[snaps.length - 2], b = snaps[snaps.length - 1];
          var dn = b.n_nodos - a.n_nodos, de = b.n_enlaces - a.n_enlaces;
          vAct.className = 'qm-ventana viva';
          elActT.textContent = signo(dn) + ' conceptos · ' + signo(de) + ' vínculos';
          elActD.innerHTML = 'Último delta medido entre muestras. <b>' +
            snaps.length + '</b> referencias de telemetría en la serie.';
        } else if (snaps.length === 1) {
          elActT.textContent = '1 referencia';
          elActD.textContent = 'La serie nace: el primer delta llegará con la ' +
            'siguiente mutación del grafo.';
        } else {
          elActT.textContent = 'Sin telemetría';
          elActD.textContent = 'La telemetría nace con la primera mutación del grafo.';
        }
      })
      .catch(function () {
        elObsD.textContent = 'Sin conexión con el sustrato.';
        elActD.textContent = 'Sin conexión con el sustrato.';
      });

    // ── ORIENTAR + DECIDIR: /qualia/red ──────────────────────────────
    fetch('/api/v1/autogenes/qualia/red')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) return;
        var etiquetaDe = {};
        j.red.nodos.forEach(function (n) { etiquetaDe[n.id] = n.etiqueta; });
        var masas = Object.keys(j.masas).map(function (id) {
          return [id, j.masas[id]];
        }).sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
        if (masas.length) {
          document.getElementById('qm-orientar').className = 'qm-ventana viva';
          elOriT.textContent = '«' + (etiquetaDe[masas[0][0]] || masas[0][0]) + '»';
          var resto = masas.slice(1, 3).map(function (m) {
            return esc(etiquetaDe[m[0]] || m[0]) + ' (' + m[1].toFixed(2) + ')';
          }).join(', ');
          elOriD.innerHTML = 'El monolito: masa <b>1.00</b> por centralidad. ' +
            (resto ? 'Le siguen ' + resto + '.' : '');
        } else {
          elOriT.textContent = 'Sin red';
          elOriD.textContent = 'El orbe nace cuando el caso tiene vínculos.';
        }

        var puentes = j.resumen.puentes || [];
        if (puentes.length) {
          document.getElementById('qm-decidir').className = 'qm-ventana viva';
          elDecT.textContent = puentes.length +
            (puentes.length === 1 ? ' puente crítico' : ' puentes críticos');
          elDecD.innerHTML = '<b>' + puentes.map(function (p) {
            return esc(p.etiqueta);
          }).join('</b>, <b>') + '</b> — si ' +
            (puentes.length === 1 ? 'cae' : 'caen') +
            ', la red se parte. Simula la caída en la cascada.';
        } else {
          elDecT.textContent = 'Sin puentes';
          elDecD.textContent = 'La red no depende de un solo nodo — redundancia real.';
        }
      })
      .catch(function () {
        elOriD.textContent = 'Sin conexión con el sustrato.';
        elDecD.textContent = 'Sin conexión con el sustrato.';
      });

    // ── LEER EL SISTEMA: la narrativa saneada ────────────────────────
    btnLeer.addEventListener('click', function () {
      btnLeer.disabled = true;
      ultimaNarrativa = null;
      btnDockear.style.display = 'none';
      elMsj.className = 'ag-msj';
      elMsj.textContent = 'El modelo interpreta el digesto…';
      elParte.innerHTML = '<div class="sp-scan" aria-hidden="true" ' +
        'style="margin:16px auto"></div>';
      fetch('/api/v1/autogenes/qualia/narrativa', { method: 'POST' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btnLeer.disabled = false;
          elMsj.textContent = '';
          if (!res.ok) {
            elParte.innerHTML = '<p class="qa-base-hint">' +
              esc(res.j.error || 'La lectura falló — reintenta.') + '</p>';
            return;
          }
          var n = res.j.narrativa;
          var etiquetas = {};
          (res.j.digesto.metricas || []).forEach(function (m) {
            etiquetas[m.clave] = m.etiqueta;
          });
          (res.j.digesto.conceptos || []).forEach(function (c) {
            etiquetas[c.clave] = c.etiqueta;
          });
          var html = '<p class="qm-panorama">' + esc(n.panorama) + '</p>';
          (n.lecturas || []).forEach(function (l) {
            html += '<div class="qm-lectura"><span class="clave">' +
              esc(etiquetas[l.concepto] || l.concepto) + '</span>' +
              esc(l.lectura) + '</div>';
          });
          if ((n.observaciones || []).length) {
            html += '<ul class="qm-obs">';
            n.observaciones.forEach(function (o) {
              html += '<li>' + esc(o) + '</li>';
            });
            html += '</ul>';
          }
          html += '<p class="qa-base-hint" style="margin-top:10px">Toda lectura ' +
            'cita una clave del digesto; lo que citó claves inventadas murió en ' +
            'el saneador antes de llegar aquí.</p>';
          elParte.innerHTML = html;
          ultimaNarrativa = n;
          if ((n.lecturas || []).length) {
            btnDockear.style.display = '';
            btnDockear.disabled = false;
            btnDockear.textContent = 'dockear el parte';
          }
        })
        .catch(function () {
          btnLeer.disabled = false;
          elMsj.className = 'ag-msj error';
          elMsj.textContent = 'Sin conexión — reintenta';
          elParte.innerHTML = '<p class="qa-base-hint">No se pudo contactar al ' +
            'modelo. Revisa el proveedor en admin.</p>';
        });
    });

    // ── DOCKEAR EL PARTE: narrativa -> Producto{informe, qualia} ─────
    // El servidor recalcula el digesto y vuelve a sanear antes de
    // escribir; aquí solo se envía la narrativa ya mostrada.
    btnDockear.addEventListener('click', function () {
      if (!ultimaNarrativa) return;
      btnDockear.disabled = true;
      elMsj.className = 'ag-msj';
      elMsj.textContent = 'Dockeando el parte…';
      fetch('/api/v1/autogenes/qualia/parte/dockear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrativa: ultimaNarrativa })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) {
            btnDockear.disabled = false;
            elMsj.className = 'ag-msj error';
            elMsj.textContent = res.j.error || 'No se pudo dockear — reintenta';
            return;
          }
          btnDockear.textContent = 'parte dockeado';
          elMsj.className = 'ag-msj';
          elMsj.textContent = '«' + res.j.producto.titulo +
            '» ya es un producto del grafo';
        })
        .catch(function () {
          btnDockear.disabled = false;
          elMsj.className = 'ag-msj error';
          elMsj.textContent = 'Sin conexión — reintenta';
        });
    });
  });
})();
