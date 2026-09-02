/* GNOSIS · GESTELL — la casa común del frontend.
   Hallazgos H13 y H14 del diagnóstico v01, reabiertos como R5 en el v02.

   H13 · CARRERAS DE FETCH. El arreglo C5 (token de secuencia) se quedó en
   `nomos.js`, y solo en su backtest. El resto de superficies no tenía guarda
   alguna: cambiar de sesión dos veces seguidas hace que la respuesta lenta de
   la PRIMERA pinte encima de la segunda, y el operador lee cifras de una
   sesión bajo el título de otra. `fetchUltimo(clave, url)` resuelve solo por
   la última petición de cada clave, y aborta las anteriores.

   H14 · `esc()` DEFINIDO 19 VECES. No era un hallazgo de XSS —la muestra
   leída escapaba correctamente— sino de DERIVA: 19 copias acaban
   divergiendo, y la que divergerá es la que nadie mira. Una sola casa.

   Sin estado global salvo el registro de peticiones vivas, que es el estado
   que el problema exige llevar. */
window.GestellComun = (function () {
  'use strict';

  /* Escapa para interpolar en HTML. Cubre &, <, > y las dos comillas: sin la
     simple, un valor dentro de un atributo con comillas simples escapa del
     atributo. */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c];
    });
  }

  /* Petición viva por clave: { seq, ctrl }. La clave agrupa lo que compite
     por el mismo hueco de pantalla — normalmente el panel que se repinta. */
  var vivas = Object.create(null);

  /* La última petición de `clave` gana, siempre.

     Dos guardas, no una: `AbortController` corta la anterior en la red
     (ahorra trabajo y evita que el servidor siga sirviendo lo que ya no se
     quiere), y el número de secuencia descarta la respuesta que aun así
     llegue tarde. La segunda hace falta porque abortar es una carrera en sí
     misma: una respuesta ya en vuelo puede resolverse antes de que el abort
     llegue.

     Devuelve una promesa que resuelve con el JSON. Si la petición quedó
     obsoleta NO resuelve ni rechaza: se queda pendiente a propósito, para que
     el `.then()` de quien pinta no llegue a ejecutarse. Los rechazos por
     aborto tampoco se propagan — no son errores, son la guarda funcionando. */
  function fetchUltimo(clave, url, opciones) {
    var previa = vivas[clave];
    if (previa && previa.ctrl) {
      try { previa.ctrl.abort(); } catch (_) { /* navegador sin abort */ }
    }
    var seq = ((previa && previa.seq) || 0) + 1;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    vivas[clave] = { seq: seq, ctrl: ctrl };

    var config = Object.assign({}, opciones || {});
    if (ctrl) config.signal = ctrl.signal;

    return new Promise(function (resolver, rechazar) {
      fetch(url, config).then(function (r) {
        if (!vigente(clave, seq)) return;      // llegó tarde: no se pinta
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (datos) {
        if (!vigente(clave, seq)) return;
        resolver(datos);
      }).catch(function (e) {
        if (!vigente(clave, seq)) return;      // abortada: no es un error
        if (e && e.name === 'AbortError') return;
        rechazar(e);
      });
    });
  }

  function vigente(clave, seq) {
    return vivas[clave] && vivas[clave].seq === seq;
  }

  /* Para cuando la superficie se desmonta o el operador cancela. */
  function cancelar(clave) {
    var viva = vivas[clave];
    if (viva && viva.ctrl) {
      try { viva.ctrl.abort(); } catch (_) { /* idem */ }
    }
    if (viva) viva.seq = viva.seq + 1;         // invalida lo que esté en vuelo
  }

  return { esc: esc, fetchUltimo: fetchUltimo, cancelar: cancelar,
           _vigente: vigente };
})();
