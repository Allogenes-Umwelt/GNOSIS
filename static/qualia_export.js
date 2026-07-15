/* GNOSIS · Qualia — export compartido (Q5: cierre del lazo).
   Dos salidas por instrumento, alineadas con L2-E8 del grafo: un PNG
   «exhibit» (el lienzo tal cual + un pie de fuente con sesión, fecha y
   método) y un CSV con los datos crudos detrás del lienzo. Todo se arma en
   el cliente desde lo que el instrumento ya trae — no vuelve al servidor,
   no inventa nada. Cada instrumento llama QualiaExport.montar({canvas,
   cod, titulo, metodo, archivo, datos}) y este helper inyecta el control
   PNG·CSV en la leyenda. Tokens por tema; sin magenta. */
window.QualiaExport = (function () {
  'use strict';
  var Q = window.QualiaComun;

  function descargar(url, nombre) {
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function hoy() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function sesionActual() {
    var el = document.querySelector('.ag-centro-head .s');
    return el ? el.textContent.replace(/^SESI[ÓO]N\s*/i, '').trim() : '';
  }
  // Deriva la designación del instrumento del propio encabezado (una sola
  // fuente de verdad: el código vive en la plantilla, no duplicado en el JS).
  function desig() {
    var cod = document.querySelector('.qa-desig .cod');
    var nom = document.querySelector('.qa-desig .nom');
    return {
      cod: cod ? cod.textContent.split('·')[0].trim() : '',
      titulo: nom ? nom.textContent.replace(/^[◆\s]*Qualia\s*·\s*/i, '').trim() : ''
    };
  }

  // PNG exhibit: el lienzo (a su resolución real) + un pie de fuente.
  function png(canvas, meta) {
    var C = Q.leerColores();
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.width, H = canvas.height, pie = Math.round(66 * dpr);
    var out = document.createElement('canvas');
    out.width = W; out.height = H + pie;
    var ctx = out.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    ctx.fillStyle = C.surface; ctx.fillRect(0, H, W, pie);
    ctx.strokeStyle = C.acc; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(0, H + 0.5); ctx.lineTo(W, H + 0.5); ctx.stroke();
    ctx.globalAlpha = 1; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.acc; ctx.font = '700 ' + Math.round(13 * dpr) + 'px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText((meta.cod || '') + ' · ' + (meta.titulo || ''), 18 * dpr, H + pie * 0.36);
    ctx.fillStyle = C.t3; ctx.font = Math.round(11 * dpr) + 'px "JetBrains Mono", monospace';
    ctx.fillText('sesión ' + (meta.sesion || '—') + ' · ' + meta.fecha +
      ' · ' + (meta.metodo || ''), 18 * dpr, H + pie * 0.70);
    ctx.textAlign = 'right';
    ctx.fillText('GNOSIS · confidencial', W - 18 * dpr, H + pie * 0.70);
    out.toBlob(function (b) {
      var u = URL.createObjectURL(b);
      descargar(u, (meta.archivo || 'qualia') + '-' + meta.fecha + '.png');
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    });
  }

  function csv(meta) {
    var d = meta.datos ? meta.datos() : { headers: [], filas: [] };
    function celda(v) {
      v = v == null ? '' : String(v);
      return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var lin = ['# GNOSIS · ' + (meta.cod || '') + ' ' + (meta.titulo || '') +
      ' · sesión ' + (meta.sesion || '—') + ' · ' + meta.fecha +
      ' · ' + (meta.metodo || '')];
    if (d.headers) lin.push(d.headers.map(celda).join(','));
    (d.filas || []).forEach(function (f) { lin.push(f.map(celda).join(',')); });
    var blob = new Blob([lin.join('\n')], { type: 'text/csv;charset=utf-8' });
    var u = URL.createObjectURL(blob);
    descargar(u, (meta.archivo || 'qualia') + '-' + meta.fecha + '.csv');
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }

  // Inyecta el control PNG·CSV en la leyenda (o en meta.host).
  function montar(meta) {
    var host = meta.host || document.querySelector('.ag-leyenda');
    if (!host || !meta.canvas) return;
    var esUl = host.tagName === 'UL';
    var wrap = document.createElement(esUl ? 'li' : 'span');
    wrap.className = 'qa-export';
    var bPng = document.createElement('button');
    bPng.type = 'button'; bPng.className = 'qa-exp-btn'; bPng.textContent = 'PNG';
    bPng.setAttribute('aria-label', 'Exportar imagen exhibit');
    var bCsv = document.createElement('button');
    bCsv.type = 'button'; bCsv.className = 'qa-exp-btn'; bCsv.textContent = 'CSV';
    bCsv.setAttribute('aria-label', 'Exportar datos en CSV');
    wrap.appendChild(document.createTextNode('exportar '));
    wrap.appendChild(bPng); wrap.appendChild(bCsv);
    host.appendChild(wrap);

    function base() {
      var d = desig();
      return { cod: meta.cod || d.cod, titulo: meta.titulo || d.titulo,
               metodo: meta.metodo, archivo: meta.archivo || 'qualia',
               datos: meta.datos, sesion: sesionActual(), fecha: hoy() };
    }
    bPng.addEventListener('click', function () { png(meta.canvas, base()); });
    bCsv.addEventListener('click', function () { csv(base()); });
  }

  return { montar: montar, png: png, csv: csv };
})();
