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

    // Clic en un nodo del lienzo: fija los extremos sin teclear (el gesto
    // central de Gotham). 1º = origen, 2º = destino + traza; el 3º reinicia.
    lienzo.addEventListener('grafo:nodo', function (ev) {
      var n = ev.detail;
      if (!n || n.kind === 'fragmento') return;   // el ruido de fragmentos no es extremo
      var val = n.etiqueta + ' · ' + n.kind;
      if (!desdeIn.value || (desdeIn.value && hastaIn.value)) {
        desdeIn.value = val; hastaIn.value = '';
        msj.className = 'ag-msj';
        msj.textContent = 'Origen fijado en el lienzo — elige el destino.';
      } else if (val.toLowerCase() !== desdeIn.value.toLowerCase()) {
        hastaIn.value = val;
        trazar();
      }
    });

    var invertir = document.getElementById('vn-invertir');
    if (invertir) invertir.addEventListener('click', function () {
      var a = desdeIn.value; desdeIn.value = hastaIn.value; hastaIn.value = a;
      if (desdeIn.value && hastaIn.value) trazar();
    });

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
      var der = m.deriva;
      if (der) {
        var gan = der.rutas_ganadas || [], per = der.rutas_perdidas || [];
        var ruta = function (r) { return r.pais + '×' + r.aduana; };
        cards.push(tarjeta({
          tit: 'Deriva vs sesión de referencia',
          cifra: (der.delta_volumen >= 0 ? '+' : '') + der.delta_volumen,
          unidad: 'unidades vs la referencia',
          bench: der.volumen_actual + ' ahora · ' + der.volumen_ref + ' en la referencia',
          sw: gan.length + ' ruta(s) ganada(s), ' + per.length + ' perdida(s).',
          nw: (per.length ? 'Abandonadas: ' + per.map(ruta).join(', ') : 'Sin rutas abandonadas.') +
            (gan.length ? ' · Nuevas: ' + gan.map(ruta).join(', ') : ''),
          fte: 'comparación entre sesiones · no es time-travel del pipeline'
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

    // ── Mapa esquemático de flujos (P6) ───────────────────────────────
    // Geografía empaquetada (coordenadas, cero tiles externos — ley
    // local-first). Arcos origen→México ponderados por volumen MEDIDO. Es un
    // diagrama con geografía de fondo, NO un GIS (se declara esquemático).
    var COORDS = {
      DEU: [51, 10], ESP: [40, -4], USA: [39, -98], MEX: [23, -102], JPN: [36, 138],
      FRA: [46, 2], ITA: [42, 12], GBR: [54, -2], CHN: [35, 105], KOR: [37, 127],
      BRA: [-10, -55], CAN: [56, -106], NLD: [52, 5], BEL: [50, 4], CZE: [50, 15],
      SVK: [48, 19], PRT: [39, -8], AUT: [47, 13], ARG: [-38, -63], IND: [22, 79]
    };
    function dibujarMapa(origenes) {
      var cv = document.getElementById('vn-mapa');
      if (!cv || !origenes) return;
      var cs = getComputedStyle(document.documentElement);
      var acc = cs.getPropertyValue('--acc-text').trim() || '#00D4FF';
      var cob = cs.getPropertyValue('--cobalt-on').trim() || '#8C9EFF';
      var t3 = cs.getPropertyValue('--t3').trim() || '#AAA';
      var dpr = window.devicePixelRatio || 1, W = 300, H = 150;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // ventana lon −130..30, lat 70..−10 (América + Europa)
      function P(code) {
        var c = COORDS[code]; if (!c) return null;
        var x = (c[1] + 130) / 160 * W, y = (70 - c[0]) / 80 * H;
        return [Math.max(8, Math.min(W - 8, x)), Math.max(10, Math.min(H - 8, y))];
      }
      var mex = P('MEX'); if (!mex) return;
      var maxU = Math.max.apply(null, origenes.map(function (o) { return o.unidades; }).concat([1]));
      origenes.forEach(function (o) {
        var p = P(o.nombre); if (!p) return;
        ctx.strokeStyle = acc; ctx.globalAlpha = 0.5;
        ctx.lineWidth = 0.6 + (o.unidades / maxU) * 2.6;
        var mx = (p[0] + mex[0]) / 2, my = Math.min(p[1], mex[1]) - 26;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(mx, my, mex[0], mex[1]); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = cob;
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, 6.283); ctx.fill();
        ctx.fillStyle = t3; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText(o.nombre, p[0], p[1] - 5);
      });
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(mex[0], mex[1], 3.5, 0, 6.283); ctx.fill();
      ctx.fillStyle = t3; ctx.textAlign = 'center'; ctx.fillText('MÉXICO', mex[0], mex[1] + 11);
    }

    function cargarSesiones() {
      var sel = document.getElementById('vn-deriva');
      if (!sel) return;
      fetch('/api/v1/autogenes/sesiones').then(function (r) { return r.json(); })
        .then(function (j) {
          var ses = (j && j.sesiones) || [];
          sel.innerHTML = '<option value="">— sin comparación —</option>' +
            ses.map(function (s) {
              return '<option value="' + s.id + '">' + esc(s.etiqueta) + ' (#' + s.id + ')</option>';
            }).join('');
          sel.addEventListener('change', function () { cargarAnalisisVW(sel.value || null); });
        }).catch(function () { /* sin sustrato: el selector queda vacío */ });
    }

    function cargarAnalisisVW(sidRef) {
      if (!analisisEl) return;
      var url = '/api/v1/autogenes/analisis' +
        (sidRef ? '?deriva=' + encodeURIComponent(sidRef) : '');
      fetch(url)
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
          dibujarMapa(a.marca && a.marca.origenes);
        })
        .catch(function () {
          analisisEl.innerHTML = '<p class="gr-vacio">Sin conexión con el sustrato.</p>';
        });
    }
    cargarAnalisisVW();
    cargarSesiones();

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
