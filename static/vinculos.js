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

    // ── Panel VW: análisis de red traducido a negocio (I2) ───────────
    // Cada tarjeta cumple la gramática: cifra + unidad + benchmark → so what
    // → now what (acción DERIVADA, nunca recomendación inventada) → fuente.
    // Todo dato viene medido de /api/v1/autogenes/analisis; nada se estima.
    var analisisEl = document.getElementById('vn-analisis');
    var analisisTit = document.getElementById('vn-analisis-tit');

    function pct(x) { return Math.round((x || 0) * 100) + '%'; }
    function feature(k) {
      if (k.indexOf('pais:') === 0) return 'origen ' + k.slice(5);
      if (k.indexOf('aduana:') === 0) return 'aduana ' + k.slice(7);
      if (k === 'pref:J') return 'preferencia J';
      return k;
    }

    function tarjeta(t) {
      return '<div class="vn-tar">' +
        '<div class="vn-tar-tit">' + esc(t.tit) + '</div>' +
        '<div class="vn-tar-cifra">' + esc(t.cifra) +
          (t.unidad ? '<span> ' + esc(t.unidad) + '</span>' : '') + '</div>' +
        (t.bench ? '<div class="vn-tar-bench">' + esc(t.bench) + '</div>' : '') +
        '<div class="vn-tar-sw">' + esc(t.sw) + '</div>' +
        '<div class="vn-tar-nw">▸ ' + esc(t.nw) + '</div>' +
        '<div class="vn-tar-fte">' + esc(t.fte) + '</div>' +
        '</div>';
    }

    function tarjetasDe(a) {
      var m = a.marca || {}, cards = [];
      if (m.origenes && m.origenes.length) {
        var o0 = m.origenes[0], ho = m.hhi_origenes || {};
        var banda = (ho.banda || '');
        cards.push(tarjeta({
          tit: 'Concentración de origen',
          cifra: pct(o0.pct), unidad: 'desde ' + o0.nombre,
          bench: 'HHI ' + (ho.hhi != null ? ho.hhi : '—') + ' · ' + banda,
          sw: banda.indexOf('alta') === 0 ? 'Dependencia alta de un solo origen.'
            : banda.indexOf('moderada') === 0 ? 'Concentración moderada de orígenes.'
            : 'Orígenes repartidos.',
          nw: 'Exposición a ' + o0.nombre + ': ' + o0.unidades + ' de ' + m.volumen + ' unidades.',
          fte: m.volumen + ' unidades · HHI sobre ' + m.n_origenes + ' orígenes medidos'
        }));
      }
      if (m.redundancia_rutas != null) {
        cards.push(tarjeta({
          tit: 'Redundancia de suministro',
          cifra: String(m.redundancia_rutas),
          unidad: m.redundancia_rutas === 1 ? 'ruta independiente' : 'rutas independientes',
          bench: m.n_origenes + ' orígenes · ' + m.n_aduanas + ' aduanas',
          sw: m.redundancia_rutas <= 1 ? 'Una sola vía de suministro: sin holgura.'
            : m.redundancia_rutas + ' vías de suministro disjuntas.',
          nw: m.redundancia_rutas <= 1 ? 'Punto único de falla: toda la vía comparte un cuello.'
            : 'Cada vía es independiente de las demás.',
          fte: 'corte mínimo unitario sobre la subred de la marca'
        }));
      }
      var cc = m.corte_critico;
      if (cc) {
        cards.push(tarjeta({
          tit: 'Corte crítico de suministro',
          cifra: pct(cc.pct_suministro), unidad: 'del suministro',
          bench: 'en ' + cc.n_rutas + (cc.n_rutas === 1 ? ' ruta · ' : ' rutas · ') + cc.volumen + ' unidades',
          sw: 'Si caen estas rutas, se interrumpe ese flujo.',
          nw: 'Vigilar: ' + (cc.rutas || []).map(function (r) {
            return r.de + '→' + r.a + ' (' + r.unidades + ')'; }).join(', '),
          fte: 'max-flow / min-cut sobre volumen medido'
        }));
      }
      if (a.brokers && a.brokers.length) {
        var b0 = a.brokers[0];
        var otras = a.brokers.slice(1).map(function (b) {
          return esc(b.etiqueta) + ' (' + b.intermediacion + ')'; }).join(' · ');
        cards.push(tarjeta({
          tit: 'Broker aduanal',
          cifra: b0.etiqueta, unidad: '',
          bench: 'intermediación ' + b0.intermediacion + ' · ' + b0.unidades + ' unidades',
          sw: 'La aduana que más intermedia el flujo del caso.',
          nw: 'Auditar primero ' + b0.etiqueta + (otras ? '. Otras: ' + otras : '.'),
          fte: 'betweenness sobre la red país→aduana→marca'
        }));
      }
      var sim = m.similitud_conductual;
      if (sim && sim.length) {
        var s0 = sim[0];
        var otrasSim = sim.slice(1).map(function (s) {
          return esc(s.marca) + ' (' + s.similitud + ')'; }).join(' · ');
        cards.push(tarjeta({
          tit: 'Se comporta como ' + m.nombre,
          cifra: s0.marca, unidad: '',
          bench: 'similitud ' + s0.similitud + (s0.comparten.length
            ? ' · comparten ' + s0.comparten.map(feature).join(', ') : ''),
          sw: 'La marca que más se comporta como ' + m.nombre + ' (origen, aduana, preferencia).',
          nw: 'Comparar contra ' + s0.marca + (otrasSim ? '. Otras: ' + otrasSim : '.'),
          fte: 'coseno sobre features de origen/aduana/preferencia medidos'
        }));
      }
      var br = m.brecha_jn;
      if (br && br.length) {
        var g0 = br[0];
        cards.push(tarjeta({
          tit: 'Brecha de preferencia J/N',
          cifra: pct(g0.brecha), unidad: 'menos que sus pares',
          bench: g0.pais + '×' + g0.aduana + ': ' + m.nombre + ' ' + pct(g0.share_foco) +
            ' J vs pares ' + pct(g0.share_pares) + ' J',
          sw: m.nombre + ' usa la preferencia arancelaria menos que marcas pares en esta ruta.',
          nw: 'Revisar por qué ' + m.nombre + ' no usa J en ' + g0.aduana +
            ' (' + g0.unidades_foco + ' unidades).',
          fte: 'share medido en unidades sobre rutas idénticas · sin montos'
        }));
      }
      var aus = m.rutas_ausentes;
      if (aus && aus.length) {
        var r0 = aus[0];
        cards.push(tarjeta({
          tit: 'Rutas esperadas-pero-ausentes',
          cifra: String(aus.length),
          unidad: 'ruta(s) que los pares usan y ' + m.nombre + ' no',
          bench: r0.pais + '×' + r0.aduana + ' · pares: ' + r0.marcas.join(', '),
          sw: 'Rutas donde marcas pares operan pero ' + m.nombre + ' está ausente.',
          nw: 'Evaluar ' + r0.pais + '×' + r0.aduana + ' (pares mueven ' +
            r0.unidades_pares + ' unidades ahí).',
          fte: 'ausencia medida vs pares en la misma sesión · no es pronóstico'
        }));
      }
      return cards.join('');
    }

    function cargarAnalisisVW() {
      if (!analisisEl) return;
      fetch('/api/v1/autogenes/analisis')
        .then(function (r) { return r.json(); })
        .then(function (a) {
          if (!a || a.error) {
            analisisEl.innerHTML = '<p class="gr-vacio">' + esc(a && a.error || 'Sin análisis disponible.') + '</p>';
            return;
          }
          if (!a.suficiente) {
            analisisEl.innerHTML = '<p class="gr-vacio">' + esc(a.motivo || 'Estructura insuficiente para el análisis.') + '</p>';
            return;
          }
          if (analisisTit && a.marca && a.marca.nombre) {
            analisisTit.textContent = a.marca.nombre +
              (a.marca.es_defecto ? '' : ' · marca de mayor volumen') + ' · lectura de negocio';
          }
          analisisEl.innerHTML = tarjetasDe(a) ||
            '<p class="gr-vacio">Sin métricas para esta marca.</p>';
        })
        .catch(function () {
          analisisEl.innerHTML = '<p class="gr-vacio">Sin conexión con el sustrato.</p>';
        });
    }
    cargarAnalisisVW();

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
