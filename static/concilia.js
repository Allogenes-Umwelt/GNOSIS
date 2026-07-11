/* GNOSIS · CONCILIA (F9, CNC-01) — dashboard de conciliación tri-fuente.
   Todo número es salida del motor (autogenes/concilia.py): flujo
   vendido/conciliado/llegado, bandas de balance (hueco = magenta) y
   hallazgos monetizados ordenados por valor en riesgo. La ficha lista
   unidades y referencias exactas para auditar fila por fila. CERO snake
   oil: sesión limpia = cero hallazgos y se dice. Datos: /api/v1/autogenes/concilia. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var elLista = document.getElementById('cn-hallazgos');
    var elDetalle = document.getElementById('cn-detalle');
    var elCupos = document.getElementById('cn-cupos');
    var btnDossier = document.getElementById('cn-dossier');
    var elMsj = document.getElementById('cn-msj');
    var datos = null;
    var activo = -1;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function num(n) {
      return n == null ? '—' : Number(n).toLocaleString('es-MX');
    }
    function dinero(monto, moneda) {
      if (monto == null) return null;
      return '$' + Number(monto).toLocaleString('es-MX', { maximumFractionDigits: 0 }) +
        (moneda ? ' ' + moneda : '');
    }

    function pintarFlujo(f, riesgo) {
      document.getElementById('cn-vendidos').textContent = num(f.vendidos);
      document.getElementById('cn-conciliados').innerHTML = num(f.conciliados) +
        (f.pct_conciliado != null ? ' <small>' + f.pct_conciliado + '%</small>' : '');
      document.getElementById('cn-llegados').textContent = num(f.llegados);
      var elRiesgo = document.getElementById('cn-riesgo');
      elRiesgo.textContent = riesgo > 0 ? dinero(riesgo, '') : '$0';
      elRiesgo.classList.toggle('riesgo', riesgo > 0);

      function banda(idPista, idPct, total, ok) {
        var pista = document.getElementById(idPista);
        var pct = document.getElementById(idPct);
        pista.innerHTML = '';
        if (!total) { pct.textContent = 'sin filas'; return; }
        var pOk = Math.max(0, Math.min(100, 100 * ok / total));
        pista.innerHTML = '<div class="ok" style="width:' + pOk.toFixed(1) + '%"></div>' +
          (ok < total ? '<div class="hueco" style="width:' + (100 - pOk).toFixed(1) + '%"></div>' : '');
        pct.textContent = num(ok) + ' / ' + num(total);
      }
      banda('cn-banda-dwh', 'cn-pct-dwh', f.vendidos, f.conciliados);
      banda('cn-banda-pdf', 'cn-pct-pdf', f.llegados, f.llegados - f.sin_venta);
    }

    function pintarLista() {
      if (!datos.hallazgos.length) {
        elLista.innerHTML = '<p class="qa-base-hint">Sesión conciliada — cero ' +
          'hallazgos. Las bandas de arriba son la prueba: todo lo vendido ' +
          'tiene llegada y nada llegado sobra.</p>';
        return;
      }
      var html = '';
      datos.hallazgos.forEach(function (h, i) {
        var monto = dinero(h.monto, h.moneda);
        html += '<button type="button" class="cn-caja qa-item' +
          (i === activo ? ' activo' : '') + '" data-i="' + i + '">' +
          '<span class="clase">' + esc(h.clase.replace(/_/g, ' ')) + '</span>' +
          '<span class="fila"><span class="titulo">' + esc(h.titulo) + '</span>' +
          '<span class="monto' + (monto ? '' : ' neutro') + '">' +
          (monto || 'sin monto') + '</span></span>' +
          '<p class="detalle">' + esc(h.detalle) + '</p></button>';
      });
      elLista.innerHTML = html;
      elLista.querySelectorAll('.cn-caja').forEach(function (btn) {
        btn.addEventListener('click', function () {
          seleccionar(Number(btn.dataset.i));
        });
      });
    }

    function seleccionar(i) {
      activo = i;
      pintarLista();
      pintarFicha(datos.hallazgos[i]);
      dibujarCaudal();
    }

    function pintarFicha(h) {
      var monto = dinero(h.monto, h.moneda);
      var html = '<span class="cn-ficha-clase">' +
        esc(h.clase.replace(/_/g, ' ')) + '</span>' +
        '<h3 style="margin:2px 0 2px">' + esc(h.titulo) + '</h3>' +
        '<div class="cn-ficha-monto' + (monto ? '' : ' neutro') + '">' +
        (monto || 'sin monto — no se estima') + '</div>' +
        '<p class="qa-base-hint" style="margin:0 0 8px">' + esc(h.detalle) + '</p>';

      html += '<div class="qa-sec">Unidades · ' + h.n_unidades + '</div><div class="qa-lista">';
      h.unidades.forEach(function (u) {
        html += '<div class="cn-ref"><b>' + esc(u) + '</b></div>';
      });
      if (h.n_unidades > h.unidades.length) {
        html += '<p class="qa-base-hint">+' + (h.n_unidades - h.unidades.length) +
          ' más — el conteo y el monto SÍ las incluyen.</p>';
      }
      html += '</div><div class="qa-sec">Referencias</div><div class="qa-lista">';
      h.refs.forEach(function (r) {
        var partes = [];
        if (r.factura) partes.push('factura <b>' + esc(r.factura) + '</b>');
        if (r.chasis) partes.push('chasis <b>' + esc(r.chasis) + '</b>');
        if (r.dwh) {
          partes.push('DWH dice <b>' + esc(r.dwh) + '</b> · PDF dice <b>' +
            esc(r.pdf) + '</b>');
        }
        if (r.filename) partes.push('PDF <b>' + esc(r.filename) + '</b>');
        if (r.veces) partes.push('<b>' + r.veces + '</b> veces');
        html += '<div class="cn-ref"><span>' + partes.join(' · ') + '</span></div>';
      });
      html += '</div>';
      elDetalle.innerHTML = html;
      btnDossier.style.display = '';
      btnDossier.disabled = false;
      btnDossier.textContent = 'dockear dossier';
      elMsj.textContent = '';
    }

    // ── lookup directo: estado vivo tri-fuente de un VIN ─────────────
    var formVin = document.getElementById('cn-vin-form');
    if (formVin) formVin.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var q = document.getElementById('cn-vin').value.trim();
      if (!q) return;
      btnDossier.style.display = 'none';
      elDetalle.innerHTML = '<p class="qa-base-hint">Buscando…</p>';
      fetch('/api/v1/autogenes/concilia/vin?chasis=' + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (v) {
          if (v.error) {
            elDetalle.innerHTML = '<p class="qa-base-hint">' + esc(v.error) + '</p>';
            return;
          }
          if (v.ambiguo) {
            elDetalle.innerHTML = '<p class="qa-base-hint">Varios chasis ' +
              'casan — precisa uno:</p><div class="qa-lista">' +
              v.candidatos.map(function (c) {
                return '<div class="cn-ref"><b>' + esc(c) + '</b></div>';
              }).join('') + '</div>';
            return;
          }
          var html = '<h3 style="margin:0 0 2px;font-family:var(--font-mono);' +
            'font-size:.85rem">' + esc(v.chasis) + '</h3>' +
            '<div class="cn-estado' + (v.conciliado ? '' : ' mal') + '">' +
            (v.conciliado ? 'conciliado' : 'sin conciliar') + '</div>';
          if (v.duplicado_dwh || v.duplicado_llegadas) {
            html += '<p class="qa-base-hint" style="color:var(--danger)">VIN ' +
              'repetido en ' + (v.duplicado_dwh ? 'el DWH' : 'las llegadas') + '.</p>';
          }
          html += '<div class="qa-sec">DWH · vendido</div><div class="qa-lista">';
          html += v.dwh.length ? v.dwh.map(function (d) {
            return '<div class="cn-ref"><b>' + esc(d.factura || 's/f') + '</b>' +
              '<span>' + (d.precio != null ? '$' +
                Number(d.precio).toLocaleString('es-MX') + ' MXN · ' : '') +
              'J/N <b>' + esc(d.j_y_n || '—') + '</b> · país <b>' +
              esc(d.pais_code || '—') + '</b>' +
              (d.numero_pedimento ? ' · pedimento <b>' + esc(d.numero_pedimento) +
                '</b>' : ' · sin pedimento') + '</span></div>';
          }).join('') : '<p class="qa-base-hint">Nada vendido con este chasis.</p>';
          html += '</div><div class="qa-sec">PDF · llegado</div><div class="qa-lista">';
          html += v.llegadas.length ? v.llegadas.map(function (d) {
            return '<div class="cn-ref"><b>' + esc(d.filename || d.factura || 's/f') +
              '</b><span>' + (d.amount ? esc(d.amount) + ' ' +
                esc(d.moneda || '') + ' · ' : '') +
              'J/N <b>' + esc(d.j_y_n || '—') + '</b> · país <b>' +
              esc(d.pais_code || '—') + '</b></span></div>';
          }).join('') : '<p class="qa-base-hint">Ninguna factura física lo cita.</p>';
          html += '</div>';
          if (v.disputas.length) {
            html += '<div class="qa-sec">En disputa</div><div class="qa-lista">' +
              v.disputas.map(function (d) {
                return '<div class="cn-ref"><span>' + esc(d.campo) +
                  ': DWH dice <b>' + esc(d.dwh) + '</b> · PDF dice <b>' +
                  esc(d.pdf) + '</b></span></div>';
              }).join('') + '</div>';
          }
          elDetalle.innerHTML = html;
        })
        .catch(function () {
          elDetalle.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
        });
    });

    // ── dossier de defensa: snapshot completo del hallazgo vivo ─────
    btnDossier.addEventListener('click', function () {
      if (activo < 0 || !datos) return;
      var clave = datos.hallazgos[activo].clave;
      btnDossier.disabled = true;
      elMsj.className = 'ag-msj';
      elMsj.textContent = 'Dockeando…';
      fetch('/api/v1/autogenes/concilia/dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: clave })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) {
            btnDossier.disabled = false;
            elMsj.className = 'ag-msj error';
            elMsj.textContent = res.j.error || 'No se pudo dockear — reintenta';
            return;
          }
          btnDossier.textContent = 'dossier dockeado';
          elMsj.textContent = '«' + res.j.producto.titulo + '» ya es producto del grafo';
        })
        .catch(function () {
          btnDossier.disabled = false;
          elMsj.className = 'ag-msj error';
          elMsj.textContent = 'Sin conexión — reintenta';
        });
    });

    // ── cupos what-if: proyección sobre run-rate medido ──────────────
    function pintarCupos(c) {
      if (!c.cupos.length) {
        elCupos.innerHTML = '<p class="qa-base-hint">La sesión no tiene ' +
          'cupos registrados.</p>';
        return;
      }
      var html = '';
      c.cupos.forEach(function (q) {
        var linea;
        if (q.motivo) {
          linea = esc(q.motivo);
        } else {
          linea = 'run-rate <b>' + num(q.run_rate) + '</b>/mes → se agota en ~<b>' +
            num(q.meses_restantes) + '</b> meses' +
            (q.mes_estimado_agote ? ' (mes ' + q.mes_estimado_agote + ')'
              : ' — fuera del ejercicio');
        }
        html += '<div class="cn-ref' + (q.mes_agotado ? ' agotado' : '') + '">' +
          '<b>' + esc(q.tipo) + ' · ' + esc(q.numero || 's/n') + '</b>' +
          '<span>saldo <b>' + num(q.saldo) + '</b> de ' + num(q.inicial) +
          ' · ' + linea + '</span></div>';
      });
      html += '<p class="qa-base-hint">' + esc(c.nota) + '</p>';
      elCupos.innerHTML = html;
    }

    fetch('/api/v1/autogenes/concilia/cupos')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elCupos.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        pintarCupos(j);
      })
      .catch(function () {
        elCupos.innerHTML = '<p class="qa-base-hint">Sin conexión.</p>';
      });

    // ── ANATOMÍA DEL CAUDAL: el Sankey determinista del motor ────────
    // Tres pilas (vendido / conciliado / llegado) unidas por la cinta
    // acento de lo conciliado; cada hallazgo es un chip magenta abajo,
    // conectado por cinta (fugas de flujo, grosor ∝ unidades) o hilo
    // (disputas y atributos) al punto exacto del caudal donde sangra.
    var lienzo = document.getElementById('cn-lienzo');
    var canvas = lienzo && lienzo.querySelector('canvas');
    var ctx = canvas && canvas.getContext('2d');
    var colores = {};
    var chips = [];             // hit areas: {x, y, w, h, i}

    function leerColores() {
      var cs = getComputedStyle(document.documentElement);
      colores = {
        acc: cs.getPropertyValue('--acc-solid').trim() || '#00D4FF',
        danger: cs.getPropertyValue('--danger').trim() || '#FF2E88',
        t1: cs.getPropertyValue('--t1').trim() || '#FAFAF8',
        t3: cs.getPropertyValue('--t3').trim() || '#999',
        linea: cs.getPropertyValue('--line').trim() || '#5B5B5B',
        mono: cs.getPropertyValue('--font-mono').trim() || 'monospace',
        display: cs.getPropertyValue('--font-d').trim() || 'sans-serif'
      };
    }
    function alfa(hex, a) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) +
             ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    function tamano() {
      var caja = canvas.parentElement.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = caja.width * dpr;
      canvas.height = caja.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // cinta horizontal entre dos segmentos verticales (Sankey clásico)
    function cinta(x1, a1, b1, x2, a2, b2, tinta, af, sel) {
      var cx = (x1 + x2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, a1);
      ctx.bezierCurveTo(cx, a1, cx, a2, x2, a2);
      ctx.lineTo(x2, b2);
      ctx.bezierCurveTo(cx, b2, cx, b1, x1, b1);
      ctx.closePath();
      ctx.fillStyle = alfa(tinta, sel ? af + 0.14 : af);
      ctx.fill();
      ctx.strokeStyle = alfa(tinta, sel ? 0.9 : 0.5);
      ctx.lineWidth = sel ? 1.6 : 1;
      ctx.stroke();
    }
    function hilo(x1, y1, x2, y2, tinta, sel) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1, (y1 + y2) / 2, x2, (y1 + y2) / 2, x2, y2);
      ctx.strokeStyle = alfa(tinta, sel ? 0.95 : 0.55);
      ctx.lineWidth = sel ? 2.2 : 1.4;
      ctx.stroke();
    }
    // a qué pila pertenece cada clase de hallazgo
    var LADO = {
      vendido_sin_llegada: 'izq', sin_pedimento: 'izq', vin_duplicado_dwh: 'izq',
      llegado_sin_venta: 'der', vin_duplicado_llegadas: 'der',
      extraccion_fallida: 'der',
      jn_en_disputa: 'centro', pais_en_disputa: 'centro'
    };

    function dibujarCaudal() {
      if (!ctx || !datos) return;
      leerColores();
      tamano();
      chips = [];
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var f = datos.flujo;
      ctx.clearRect(0, 0, w, h);
      if (!f.vendidos && !f.llegados) {
        ctx.fillStyle = colores.t3;
        ctx.font = '12px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos aduanales — el caudal nace con la sesión.', w / 2, h / 2);
        return;
      }

      var yTop = 64;
      var zonaChips = 92;
      var flujoH = h - yTop - zonaChips - 56;
      var maxN = Math.max(f.vendidos, f.llegados, 1);
      var s = flujoH / maxN;
      var xL = Math.round(w * 0.09), xC = Math.round(w * 0.5),
          xR = Math.round(w * 0.91), barra = 14;
      var concS = f.conciliados * s;
      var okDer = (f.llegados - f.sin_venta) * s;

      // cintas acento: lo conciliado fluye de pila a pila
      if (f.conciliados) {
        cinta(xL + barra / 2, yTop, yTop + concS,
              xC - barra / 2, yTop, yTop + concS, colores.acc, 0.18, false);
        cinta(xC + barra / 2, yTop, yTop + concS,
              xR - barra / 2, yTop, yTop + okDer, colores.acc, 0.18, false);
      }

      // chips: un nodo por hallazgo, repartidos en el zócalo
      var hs = datos.hallazgos;
      var yChip = h - zonaChips + 26;
      var chipW = hs.length ? Math.min(196, (w - 40) / hs.length - 12) : 0;
      var paso = hs.length ? (w - 40) / hs.length : 0;

      hs.forEach(function (hz, i) {
        var cxChip = 20 + paso * i + paso / 2;
        var x = cxChip - chipW / 2;
        var sel = i === activo;
        var lado = LADO[hz.clase] || 'centro';

        // conexión al caudal
        if (hz.clase === 'vendido_sin_llegada' && f.sin_llegada) {
          cinta(xL + barra / 2, yTop + concS, yTop + concS + f.sin_llegada * s,
                cxChip, yChip, yChip, colores.danger, 0.2, sel);
        } else if (hz.clase === 'llegado_sin_venta' && f.sin_venta) {
          cinta(xR - barra / 2, yTop + okDer, yTop + okDer + f.sin_venta * s,
                cxChip, yChip, yChip, colores.danger, 0.2, sel);
        } else {
          var xO = lado === 'izq' ? xL : lado === 'der' ? xR : xC;
          var yO = yTop + (lado === 'centro' ? concS
                           : lado === 'izq' ? f.vendidos * s : f.llegados * s);
          hilo(xO, yO, cxChip, yChip, colores.danger, sel);
        }

        // el chip
        ctx.fillStyle = sel ? alfa(colores.danger, 0.16) : alfa(colores.danger, 0.06);
        ctx.strokeStyle = sel ? colores.danger : alfa(colores.danger, 0.6);
        ctx.lineWidth = sel ? 1.8 : 1;
        ctx.fillRect(x, yChip, chipW, 46);
        ctx.strokeRect(x, yChip, chipW, 46);
        ctx.textAlign = 'center';
        ctx.fillStyle = colores.t1;
        ctx.font = '10px ' + colores.mono;
        var titulo = hz.titulo.toUpperCase();
        while (titulo.length > 3 && ctx.measureText(titulo).width > chipW - 12) {
          titulo = titulo.slice(0, -2);
        }
        ctx.fillText(titulo, cxChip, yChip + 18);
        ctx.fillStyle = hz.monto != null ? colores.danger : colores.t3;
        ctx.font = '11px ' + colores.mono;
        ctx.fillText(hz.monto != null
          ? '$' + Math.round(hz.monto).toLocaleString('es-MX') + ' ' + hz.moneda
          : hz.n_unidades + (hz.n_unidades === 1 ? ' unidad' : ' unidades') +
            ' · sin monto', cxChip, yChip + 35);
        chips.push({ x: x, y: yChip, w: chipW, h: 46, i: i });
      });
      if (!hs.length) {
        ctx.fillStyle = colores.t3;
        ctx.font = '11px ' + colores.mono;
        ctx.textAlign = 'center';
        ctx.fillText('SESIÓN CONCILIADA — SIN FUGAS QUE PINTAR', w / 2, yChip + 28);
      }

      // pilas encima de las cintas
      function pila(x, n, okS, etiqueta, monto, lado) {
        var alto = Math.max(n * s, n ? 2 : 0);
        ctx.fillStyle = alfa(colores.t3, 0.25);
        ctx.fillRect(x - barra / 2, yTop, barra, alto);
        if (okS) {
          ctx.fillStyle = colores.acc;
          ctx.fillRect(x - barra / 2, yTop, barra, okS);
        }
        if (alto - okS > 0.5) {
          ctx.fillStyle = alfa(colores.danger, 0.85);
          ctx.fillRect(x - barra / 2, yTop + okS, barra, alto - okS);
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = colores.t3;
        ctx.font = '10px ' + colores.mono;
        ctx.fillText(etiqueta, x, yTop - 38);
        ctx.fillStyle = colores.t1;
        ctx.font = '700 22px ' + colores.display;
        ctx.fillText(String(n), x, yTop - 14);
        if (monto != null) {
          // desplazado hacia afuera para no chocar con las cintas de fuga
          ctx.textAlign = lado === 'izq' ? 'right' : 'center';
          ctx.fillStyle = colores.t3;
          ctx.font = '10px ' + colores.mono;
          ctx.fillText('$' + Math.round(monto).toLocaleString('es-MX'),
                       lado === 'izq' ? x - barra : x,
                       yTop + Math.max(n * s, 2) + 16);
        }
      }
      pila(xL, f.vendidos, concS, 'VENDIDO · DWH', f.valor_vendido_mxn, 'izq');
      pila(xC, f.conciliados, concS, 'CONCILIADO', f.valor_conciliado_mxn, 'centro');
      pila(xR, f.llegados, okDer, 'LLEGADO · PDF', null, 'der');
    }

    if (canvas) {
      canvas.addEventListener('click', function (ev) {
        var caja = canvas.getBoundingClientRect();
        var mx = ev.clientX - caja.left, my = ev.clientY - caja.top;
        for (var k = 0; k < chips.length; k++) {
          var c = chips[k];
          if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
            seleccionar(c.i);
            return;
          }
        }
      });
      window.addEventListener('resize', dibujarCaudal);
      var alternador = document.getElementById('theme-toggle');
      if (alternador) alternador.addEventListener('click', function () {
        setTimeout(dibujarCaudal, 60);
      });
    }

    fetch('/api/v1/autogenes/concilia')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) {
          elLista.innerHTML = '<p class="qa-base-hint">' +
            esc((j && j.error) || 'Sin datos') + '</p>';
          return;
        }
        datos = j;
        pintarFlujo(j.flujo, j.valor_en_riesgo_mxn);
        pintarLista();
        dibujarCaudal();
      })
      .catch(function () {
        elLista.innerHTML = '<p class="qa-base-hint">Sin conexión con el sustrato.</p>';
      });
  });
})();
