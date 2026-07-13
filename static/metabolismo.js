/* GNOSIS · Avance del caso — muestra cuánto de lo que entra a cada
   etapa (Fuentes → Fragmentos → Entidades → Relaciones → Productos) ya
   se procesó y cuánto queda pendiente. Cada etapa dibuja dos bandas:
   RECIBIDO (tenue) y PROCESADO (sólida); la diferencia se desprende en
   rojo como PENDIENTE — una tarea accionable (documentos sin leer,
   entidades sin conectar o sin informe). El medidor central = avance
   global del caso; la tabla inferior = hecho | pendiente por etapa; el
   riel lateral = alertas de tiempo y de negocio. Tap en lo rojo abre
   qué quedó pendiente y cómo resolverlo. Animación congelada con
   prefers-reduced-motion; acento AAA por modo. Determinista. */
(function () {
  'use strict';

  var BANDA = 64;          // alto máximo de la banda potencial
  var FUGA_MAX = 78;       // caída máxima de la rama de fuga

  function montar(cont) {
    var canvas = cont.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var detalle = document.querySelector(cont.getAttribute('data-detalle') || '') || null;
    var info = document.querySelector(cont.getAttribute('data-info') || '') || null;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var colores = {}, datos = null, layout = null, sel = null, animando = false;

    // Ítems pendientes traen nombres de origen documental: escapar SIEMPRE.
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    // Las acciones son rutas internas; nada de javascript: ni URLs externas.
    function rutaSegura(u) {
      return typeof u === 'string' && u.charAt(0) === '/' && u.charAt(1) !== '/' ? u : null;
    }

    function conAlfa(hex, a) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
             ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    function leerColores() {
      var cs = getComputedStyle(document.documentElement);
      colores = {
        acc: cs.getPropertyValue('--acc-text').trim() || '#00D4FF',
        danger: cs.getPropertyValue('--danger').trim() || '#F57F9C',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#AAA'
      };
    }
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = Math.max(460, caja.height) * dpr;
      canvas.style.height = Math.max(460, caja.height) + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function calcularLayout() {
      if (!datos) return;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var margen = 96, spineY = h * 0.56;   // spine bajo: gauge arriba, fugas abajo
      var pools = datos.pools;
      var gap = (w - margen * 2) / Math.max(1, pools.length - 1);
      var maxTotal = Math.max.apply(null, pools.map(function (p) { return p.total; }).concat([1]));

      var nodos = pools.map(function (p, i) {
        return {
          x: margen + i * gap, y: spineY, pool: p,
          r: 16 + 30 * Math.sqrt(p.total / maxTotal)
        };
      });
      // reacción i conecta pool i → pool i+1 (vía lineal, sin saltos);
      // una reacción sin pool destino no se dibuja
      var reacciones = datos.reacciones.slice(0, Math.max(0, nodos.length - 1))
        .map(function (r, i) {
          var rend = r.potencial > 0 ? r.realizado / r.potencial : 1;
          return { r: r, a: nodos[i], b: nodos[i + 1], rend: rend,
                   fugaRel: r.potencial > 0 ? r.fuga / r.potencial : 0 };
        });
      layout = { nodos: nodos, reacciones: reacciones, spineY: spineY, w: w, h: h };
    }

    // gauge de salud metabólica — llena el espacio superior con dato
    function dibujarGauge() {
      if (datos.salud == null) return;
      // hero monumental: el arco crece y las etiquetas viven FUERA del
      // anillo — el número nunca comparte tinta con las letras
      var cx = layout.w / 2, cy = layout.h * 0.21, R = 64;
      var frac = datos.salud / 100;
      // dos estados honestos: magenta SOLO cuando el avance es crítico;
      // la granularidad la da el número, no un tercer color inventado
      var color = datos.salud >= 33 ? colores.acc : colores.danger;
      ctx.beginPath();
      ctx.strokeStyle = conAlfa(colores.linea, 0.7);
      ctx.lineWidth = 7;
      ctx.arc(cx, cy, R, -Math.PI * 0.75, Math.PI * 0.75);
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 7;
      ctx.arc(cx, cy, R, -Math.PI * 0.75, -Math.PI * 0.75 + frac * Math.PI * 1.5);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = '700 46px "JetBrains Mono", monospace';
      ctx.fillStyle = colores.t1;
      ctx.textAlign = 'center';
      ctx.fillText(datos.salud + '%', cx, cy + 15);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = colores.t3;
      ctx.fillText('AVANCE DEL CASO', cx, cy + R + 18);
      ctx.fillText(datos.total_fugas + ' PENDIENTES', cx, cy + R + 32);
    }

    function dibujar(ts) {
      if (!layout) return;
      var w = layout.w, h = layout.h;
      ctx.clearRect(0, 0, w, h);

      dibujarGauge();

      // reacciones (bandas pre/post + fuga)
      layout.reacciones.forEach(function (rc, idx) {
        var x0 = rc.a.x + rc.a.r, x1 = rc.b.x - rc.b.r, y = layout.spineY;
        var potH = BANDA * (rc.r.potencial > 0 ? 1 : 0.2);
        var realH = potH * rc.rend;

        // banda POTENCIAL (pre) — tenue
        ctx.fillStyle = conAlfa(colores.acc, 0.08);
        ctx.fillRect(x0, y - potH / 2, x1 - x0, potH);
        ctx.strokeStyle = conAlfa(colores.linea, 0.6);
        ctx.setLineDash([3, 5]);
        ctx.strokeRect(x0, y - potH / 2, x1 - x0, potH);
        ctx.setLineDash([]);

        // banda REALIZADA (post) — sólida
        ctx.fillStyle = conAlfa(colores.acc, 0.32);
        ctx.fillRect(x0, y - realH / 2, x1 - x0, realH);

        // partículas de flux
        if (!reduce && rc.rend > 0) {
          var n = Math.min(9, Math.max(2, Math.round(rc.r.realizado / 3)));
          for (var p = 0; p < n; p++) {
            var t = (((ts || 0) / 2600) + p / n + idx * 0.13) % 1;
            var px = x0 + (x1 - x0) * t;
            var py = y + Math.sin(p * 1.7) * realH * 0.28;
            ctx.beginPath();
            ctx.fillStyle = colores.acc;
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * Math.PI);
            ctx.arc(px, py, 1.8, 0, 6.283);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }

        // FUGA — rama magenta que se desprende hacia abajo
        if (rc.r.fuga > 0) {
          var xm = (x0 + x1) / 2;
          var caida = 30 + FUGA_MAX * Math.min(1, rc.fugaRel);
          // la gota y su etiqueta viven ARRIBA del bloque de barras
          // (y0 = 0.74h): con fuga máxima jamás lo invaden
          caida = Math.min(caida, Math.max(24, layout.h * 0.74 - y - 46));
          var anchoFuga = 3 + 16 * Math.min(1, rc.fugaRel);
          ctx.beginPath();
          ctx.moveTo(xm - anchoFuga, y);
          ctx.bezierCurveTo(xm - anchoFuga, y + caida * 0.6,
                            xm - anchoFuga, y + caida, xm, y + caida);
          ctx.bezierCurveTo(xm + anchoFuga, y + caida,
                            xm + anchoFuga, y + caida * 0.6, xm + anchoFuga, y);
          ctx.closePath();
          ctx.fillStyle = conAlfa(colores.danger, 0.28);
          ctx.fill();
          ctx.strokeStyle = colores.danger;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.lineWidth = 1;
          // nodo de fuga
          rc.fugaXY = { x: xm, y: y + caida + 10, rHit: 20 };
          var esSel = sel && sel.tipo === 'fuga' && sel.rc === rc;
          ctx.beginPath();
          ctx.fillStyle = colores.danger;
          ctx.arc(rc.fugaXY.x, rc.fugaXY.y, esSel ? 8 : 6, 0, 6.283);
          ctx.fill();
          ctx.font = '11px "JetBrains Mono", monospace';
          ctx.fillStyle = colores.danger;
          ctx.textAlign = 'center';
          ctx.fillText('−' + rc.r.fuga + ' ' + (rc.r.senal || ''),
                       rc.fugaXY.x, rc.fugaXY.y + 20);
        } else {
          rc.fugaXY = null;
        }

        // rendimiento de la reacción, sobre la banda
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = colores.t3;
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(rc.rend * 100) + '%', (x0 + x1) / 2, y - potH / 2 - 8);
        ctx.fillText(rc.r.nombre.toUpperCase(), (x0 + x1) / 2, y - potH / 2 - 20);
      });

      // pools (metabolitos)
      layout.nodos.forEach(function (n) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, 6.283);
        ctx.fillStyle = conAlfa(colores.acc, 0.1);
        ctx.fill();
        ctx.strokeStyle = colores.acc;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.font = '700 14px "JetBrains Mono", monospace';
        ctx.fillStyle = colores.t1;
        ctx.textAlign = 'center';
        ctx.fillText(n.pool.total, n.x, n.y + 5);
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = colores.t3;
        ctx.fillText(n.pool.nombre, n.x, n.y + n.r + 15);
      });

      dibujarBalance();

      // brackets de esquina
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colores.acc; ctx.lineWidth = 1.2;
      [[8, 8, 22, 8, 8, 22], [w - 8, 8, w - 22, 8, w - 8, 22],
       [8, h - 8, 22, h - 8, 8, h - 22], [w - 8, h - 8, w - 22, h - 8, w - 8, h - 22]]
        .forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[2], c[3]); ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[4], c[5]); ctx.stroke();
        });
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }

    // balance post-análisis: cada reacción de conocimiento como barra
    // realizado | fuga — la tabla FBA que llena el tercio inferior.
    function dibujarBalance() {
      var conocimiento = layout.reacciones.filter(function (rc) {
        return rc.r.clave !== 'fragmentacion';
      });
      if (!conocimiento.length) return;
      var x0 = layout.w * 0.16, x1 = layout.w * 0.84, barW = x1 - x0;
      var y0 = layout.h * 0.74, paso = Math.min(40, (layout.h * 0.2) / conocimiento.length);
      ctx.textAlign = 'left';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = colores.t3;
      ctx.fillText('POR ETAPA · HECHO | PENDIENTE', x0, y0 - 14);
      conocimiento.forEach(function (rc, i) {
        var y = y0 + i * paso;
        var rendW = barW * rc.rend;
        ctx.fillStyle = conAlfa(colores.acc, 0.32);
        ctx.fillRect(x0, y, rendW, 14);
        ctx.fillStyle = conAlfa(colores.danger, 0.28);
        ctx.fillRect(x0 + rendW, y, barW - rendW, 14);
        ctx.strokeStyle = conAlfa(colores.linea, 0.6);
        ctx.strokeRect(x0, y, barW, 14);
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = colores.t3;
        ctx.textAlign = 'right';
        ctx.fillText(rc.r.nombre.toUpperCase(), x0 - 10, y + 11);
        ctx.textAlign = 'left';
        ctx.fillStyle = colores.t1;
        ctx.fillText(rc.r.realizado + ' / ' + rc.r.potencial, x1 + 10, y + 11);
        if (rc.r.fuga > 0) {
          ctx.fillStyle = colores.danger;
          ctx.textAlign = 'center';
          ctx.fillText('−' + rc.r.fuga, x0 + rendW + (barW - rendW) / 2, y + 11);
          ctx.textAlign = 'left';
        }
      });
    }

    function animar() {
      // el rAF solo corre si hay partículas que animar y la pestaña se ve
      var conFlux = layout && layout.reacciones.some(function (rc) { return rc.rend > 0; });
      if (reduce || !conFlux) { dibujar(0); return; }
      if (animando) return;
      animando = true;
      (function paso(ts) {
        if (document.hidden) { animando = false; return; }
        dibujar(ts);
        requestAnimationFrame(paso);
      })(0);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && datos) animar();
    });

    canvas.addEventListener('click', function (ev) {
      if (!layout) return;
      var caja = canvas.getBoundingClientRect();
      var mx = ev.clientX - caja.left, my = ev.clientY - caja.top;
      sel = null;
      layout.reacciones.forEach(function (rc) {
        if (rc.fugaXY) {
          var d = (rc.fugaXY.x - mx) * (rc.fugaXY.x - mx) + (rc.fugaXY.y - my) * (rc.fugaXY.y - my);
          if (d < rc.fugaXY.rHit * rc.fugaXY.rHit) sel = { tipo: 'fuga', rc: rc };
        }
      });
      pintarDetalle();
      if (!animando) dibujar(0);
    });

    // ── triage inline: resolver una fuga/urgencia SIN salir del radar ──
    var entidadesCache = null, verbosCache = [];

    function cargarEntidades(cb) {
      if (entidadesCache) { cb(); return; }
      fetch('/api/v1/autogenes/entidades')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          entidadesCache = (j && j.entidades) || [];
          verbosCache = (j && j.verbos) || [];
          cb();
        }).catch(function () { entidadesCache = []; cb(); });
    }

    function botonAccion(texto, onClick) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tr-accion'; b.textContent = texto;
      b.addEventListener('click', onClick);
      return b;
    }

    function refrescarTras(mensaje) {
      // el cache de entidades/verbos cambió (una relación nueva, un verbo nuevo)
      entidadesCache = null;
      sel = null;
      recargarDatos(function () {
        if (detalle) detalle.innerHTML = '<div class="gr-kind">RESUELTO</div>' +
          '<p class="tr-ok">' + esc(mensaje) + '</p>';
      });
    }

    // Vincular una entidad huérfana con otra de la sesión (HITL dos pasos):
    // typeahead de entidades reales + verbo de una lista DERIVADA. Escribe
    // vía POST /relacion con origen=operador.
    function abrirVincular(huerfana) {
      cargarEntidades(function () {
        var opciones = entidadesCache.filter(function (e) { return e.id !== huerfana.id; });
        var opts = '<option value="">— elige una entidad —</option>';
        opciones.forEach(function (e) {
          opts += '<option value="' + esc(e.id) + '">' + esc(e.nombre.slice(0, 34)) + '</option>';
        });
        var dl = '';
        verbosCache.forEach(function (v) { dl += '<option value="' + esc(v) + '">'; });
        detalle.innerHTML =
          '<div class="gr-kind">VINCULAR · ' + esc(huerfana.nombre.slice(0, 22)) + '</div>' +
          '<label class="tr-lbl">Con la entidad<select id="tr-dest" class="tr-input">' +
          opts + '</select></label>' +
          '<label class="tr-lbl">Relación<input id="tr-verbo" class="tr-input" list="tr-verbos"' +
          ' placeholder="p. ej. opera en" maxlength="40" autocomplete="off">' +
          '<datalist id="tr-verbos">' + dl + '</datalist></label>' +
          '<p class="gr-vacio">Se guarda con tu autoría (operador) en la bitácora.</p>';
        var fila = document.createElement('div'); fila.className = 'tr-acciones';
        fila.appendChild(botonAccion('Crear relación', function () {
          var dest = document.getElementById('tr-dest').value;
          var verbo = (document.getElementById('tr-verbo').value || '').trim();
          if (!dest || !verbo) { avisoTriage('Elige entidad y verbo'); return; }
          this.disabled = true;
          fetch('/api/v1/autogenes/relacion', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desde_id: huerfana.id, hasta_id: dest, tipo: verbo })
          }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) {
              if (!res.ok) { avisoTriage(res.j.error || 'Falló'); return; }
              refrescarTras(huerfana.nombre + ' vinculada · fuga de vinculación −1');
            }).catch(function () { avisoTriage('Sin conexión'); });
        }));
        fila.appendChild(botonAccion('Cancelar', pintarDetalle));
        detalle.appendChild(fila);
      });
    }

    // Resolver (eliminar) un vencimiento: DELETE /evento, dos pasos.
    function abrirResolverEvento(u) {
      detalle.innerHTML =
        '<div class="gr-kind">RESOLVER · ' + esc(u.titulo.slice(0, 22)) + '</div>' +
        '<p class="gr-vacio">' + esc(u.sub) + '. Elimina el vencimiento del radar' +
        ' (irreversible).</p>';
      var fila = document.createElement('div'); fila.className = 'tr-acciones';
      fila.appendChild(botonAccion('Confirmar', function () {
        this.disabled = true;
        fetch('/api/v1/autogenes/evento/' + encodeURIComponent(u.id), { method: 'DELETE' })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            if (!res.ok) { avisoTriage(res.j.error || 'Falló'); return; }
            refrescarTras('Vencimiento resuelto');
          }).catch(function () { avisoTriage('Sin conexión'); });
      }));
      fila.appendChild(botonAccion('Cancelar', pintarDetalle));
      detalle.appendChild(fila);
    }

    function avisoTriage(texto) {
      var p = detalle.querySelector('.tr-aviso');
      if (!p) { p = document.createElement('p'); p.className = 'tr-aviso'; detalle.appendChild(p); }
      p.textContent = texto;
    }

    function errorTriage(kind, msg) {
      detalle.innerHTML = '<div class="gr-kind">' + esc(kind) + '</div>' +
        '<p class="tr-aviso">' + esc(msg) + '</p>';
      var fila = document.createElement('div'); fila.className = 'tr-acciones';
      fila.appendChild(botonAccion('Cerrar', pintarDetalle));
      detalle.appendChild(fila);
    }

    // Extraer una fuente fría: dispara la extracción citada y revisa la
    // propuesta HITL aquí mismo (mismas reglas que la ingesta), integra vía
    // Sustrato. Requiere proveedor LLM configurado.
    function abrirExtraer(fria) {
      detalle.innerHTML = '<div class="gr-kind">EXTRAER · ' + esc(fria.nombre.slice(0, 18)) +
        '</div><p class="gr-vacio">Pidiendo extracción citada…</p>';
      fetch('/api/v1/autogenes/extraer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artefacto_id: fria.id })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { errorTriage('EXTRAER', res.j.error || 'Extracción no disponible'); return; }
          revisarExtraccion(fria, res.j);
        }).catch(function () { errorTriage('EXTRAER', 'Sin conexión'); });
    }

    function revisarExtraccion(fria, prop) {
      var head = '<div class="gr-kind">REVISA · ' + esc(fria.nombre.slice(0, 16)) +
        ' · ' + (prop.quorum ? 'QUÓRUM' : 'un modelo') + '</div>';
      if (!prop.entidades || !prop.entidades.length) {
        detalle.innerHTML = head + '<p class="gr-vacio">El modelo no propuso entidades ' +
          'citables.</p>';
        var f0 = document.createElement('div'); f0.className = 'tr-acciones';
        f0.appendChild(botonAccion('Cerrar', pintarDetalle));
        detalle.appendChild(f0);
        return;
      }
      detalle.innerHTML = head;
      prop.entidades.slice(0, 14).forEach(function (e, i) {
        var lab = document.createElement('label'); lab.className = 'gr-fila';
        var marca = e.acuerdo === false ? ' ⚠' : e.acuerdo === true ? ' ✓✓' : '';
        lab.innerHTML = '<span><input type="checkbox" data-ent="' + i + '"' +
          (e.acuerdo === false ? '' : ' checked') + '> ' + esc(e.nombre.slice(0, 16)) +
          '</span><b>' + esc(e.tipo) + ' · ' + e.evidencia.length + marca + '</b>';
        detalle.appendChild(lab);
      });
      var fila = document.createElement('div'); fila.className = 'tr-acciones';
      fila.appendChild(botonAccion('Integrar ▸', function () {
        var ents = [], nombres = {};
        detalle.querySelectorAll('input[data-ent]:checked').forEach(function (c) {
          var e = prop.entidades[+c.dataset.ent]; ents.push(e);
          nombres[e.nombre.toLowerCase()] = 1;
        });
        if (!ents.length) { avisoTriage('Marca al menos una entidad'); return; }
        var rels = (prop.relaciones || []).filter(function (r) {
          return nombres[r.desde.toLowerCase()] && nombres[r.hasta.toLowerCase()];
        });
        this.disabled = true;
        fetch('/api/v1/autogenes/integrar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entidades: ents, relaciones: rels })
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            if (!res.ok) { avisoTriage(res.j.error || 'Falló'); return; }
            refrescarTras(res.j.entidades + ' entidades integradas · ' + fria.nombre +
              ' ya no está fría');
          }).catch(function () { avisoTriage('Sin conexión'); });
      }));
      fila.appendChild(botonAccion('Cancelar', pintarDetalle));
      detalle.appendChild(fila);
    }

    // Generar el informe ejecutivo citado del caso y dockearlo, sin salir del
    // radar. Requiere proveedor LLM configurado.
    function abrirSintetizar() {
      detalle.innerHTML = '<div class="gr-kind">INFORME</div>' +
        '<p class="gr-vacio">Redactando informe citado…</p>';
      fetch('/api/v1/autogenes/sintetizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { errorTriage('INFORME', res.j.error || 'Síntesis no disponible'); return; }
          revisarInforme(res.j);
        }).catch(function () { errorTriage('INFORME', 'Sin conexión'); });
    }

    function revisarInforme(r) {
      var inf = r.informe || {};
      var nPuntos = (inf.secciones || []).reduce(
        function (n, s) { return n + (s.puntos || []).length; }, 0);
      var html = '<div class="gr-kind">INFORME · ' + nPuntos + ' puntos citados</div>' +
        '<div class="gr-fila"><span>' + esc((inf.titulo || 'Informe').slice(0, 24)) +
        '</span><b>' + (r.fuentes || 0) + ' fuentes</b></div>';
      (inf.secciones || []).slice(0, 6).forEach(function (s) {
        html += '<div class="gr-fila"><span>' + esc((s.encabezado || '').slice(0, 20)) +
          '</span><b>' + (s.puntos || []).length + ' pts</b></div>';
      });
      detalle.innerHTML = html;
      var fila = document.createElement('div'); fila.className = 'tr-acciones';
      fila.appendChild(botonAccion('Dockear ▸', function () {
        this.disabled = true;
        fetch('/api/v1/autogenes/sintesis/dockear', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ informe: inf })
        }).then(function (rr) { return rr.json().then(function (j) { return { ok: rr.ok, j: j }; }); })
          .then(function (res) {
            if (!res.ok) { avisoTriage(res.j.error || 'Falló'); return; }
            refrescarTras('Informe dockeado · síntesis actualizada');
          }).catch(function () { avisoTriage('Sin conexión'); });
      }));
      var ver = document.createElement('a');
      ver.className = 'tr-accion'; ver.textContent = 'Ver completo';
      ver.href = '/autogenes/sintesis'; ver.style.flex = '1'; ver.style.textAlign = 'center';
      fila.appendChild(ver);
      fila.appendChild(botonAccion('Cancelar', pintarDetalle));
      detalle.appendChild(fila);
    }

    function pintarDetalle() {
      if (!detalle) return;
      if (!sel) {
        detalle.innerHTML = '<p class="gr-vacio">Toca lo que aparece en rojo para ' +
          'ver qué quedó pendiente y resolverlo aquí mismo.</p>';
        return;
      }
      var r = sel.rc.r;
      detalle.innerHTML = '<div class="gr-kind">PENDIENTE · ' + esc(r.nombre.toUpperCase()) +
        ' · ' + esc(r.fuga) + ' ' + esc(r.senal || '') + '</div>';
      if (r.items && r.items.length) {
        r.items.slice(0, 12).forEach(function (it) {
          var fila = document.createElement('div'); fila.className = 'gr-fila tr-item';
          fila.innerHTML = '<span>' + esc((it.nombre || it.titulo || '—').slice(0, 20)) +
            '</span><b>' + esc(it.kind || it.tipo || '') + '</b>';
          if (r.clave === 'vinculacion' && it.id) {
            fila.appendChild(botonAccion('Vincular ▸', function () { abrirVincular(it); }));
          } else if (r.clave === 'extraccion' && it.id) {
            fila.appendChild(botonAccion('Extraer ▸', function () { abrirExtraer(it); }));
          }
          detalle.appendChild(fila);
        });
      } else {
        var vacio = document.createElement('p'); vacio.className = 'gr-vacio';
        vacio.textContent = r.fuga + ' elementos sin pasar a la etapa siguiente.';
        detalle.appendChild(vacio);
      }
      // síntesis se resuelve a nivel de caso (un informe cubre varias entidades)
      if (r.clave === 'sintesis') {
        var fs = document.createElement('div'); fs.className = 'tr-acciones';
        fs.appendChild(botonAccion('Generar informe ▸', abrirSintetizar));
        detalle.appendChild(fs);
      }
      // fallback: fugas sin acción inline conservan el enlace a su superficie
      var ruta = rutaSegura(r.accion);
      if (ruta && r.clave !== 'vinculacion' && r.clave !== 'extraccion'
          && r.clave !== 'sintesis') {
        var a = document.createElement('a');
        a.className = 'ag-volver'; a.style.marginTop = '10px';
        a.href = ruta; a.textContent = 'Resolver en su página ▸';
        detalle.appendChild(a);
      }
    }

    function pintarUrgencias() {
      var ul = document.querySelector(cont.getAttribute('data-urgencias') || '');
      if (!ul) return;
      ul.innerHTML = '';
      (datos.urgencias || []).forEach(function (u) {
        var li = document.createElement('li');
        var ruta = rutaSegura(u.accion);
        var fila = document.createElement(u.tipo === 'vencimiento' ? 'button' : 'a');
        fila.className = 'tr-urg';
        fila.innerHTML = '<span style="color:' + (u.critico ? 'var(--danger)' : 'var(--t2)') +
          '">' + esc(u.titulo.slice(0, 30)) + '</span><span class="dato">' + esc(u.sub) + '</span>';
        if (u.tipo === 'vencimiento' && u.id) {
          fila.type = 'button';
          fila.addEventListener('click', function () { abrirResolverEvento(u); });
        } else {
          fila.href = ruta || '#';
          if (!ruta) fila.style.pointerEvents = 'none';
        }
        li.appendChild(fila);
        ul.appendChild(li);
      });
      if (!(datos.urgencias || []).length) {
        ul.innerHTML = '<li><span class="gr-vacio" style="padding:8px">' +
          'Sin urgencias temporales ni de negocio.</span></li>';
      }
    }

    function recargarDatos(despues) {
      fetch('/api/v1/autogenes/metabolismo')
        .then(function (r) { return r.json(); })
        .then(function (m) {
          if (!m || m.error) { if (info) info.textContent = (m && m.error) || 'SIN DATOS'; return; }
          datos = m;
          calcularLayout();
          pintarUrgencias();
          if (info) {
            info.textContent = 'AVANCE DEL CASO ' +
              (m.salud == null ? '—' : m.salud + '%') + ' · ' + m.total_fugas +
              ' PENDIENTES · HOY ' + m.hoy;
          }
          if (despues) { despues(); } else { pintarDetalle(); }
          animar();
        })
        .catch(function () { if (info) info.textContent = 'SIN CONEXIÓN CON EL SUSTRATO'; });
    }

    function cargar() { recargarDatos(null); }

    leerColores();
    tamano();
    window.addEventListener('resize', function () { tamano(); calcularLayout(); if (!animando) dibujar(0); });
    var alternador = document.getElementById('theme-toggle');
    if (alternador) alternador.addEventListener('click', function () {
      setTimeout(function () { leerColores(); if (!animando) dibujar(0); }, 60);
    });
    cargar();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.mt-lienzo').forEach(montar);
  });
})();
