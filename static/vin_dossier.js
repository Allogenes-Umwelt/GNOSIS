/* GNOSIS · enlaza cada VIN citado con el cajón de dossier compartido (O0.4).
   Un chasis rendido con window.vinChip() abre QualiaDossier en su sitio —el
   expediente de negocio de la entidad: citas a fragmento, relaciones, eventos,
   productos que la anclan— y la selección viaja en ?sel. Si el caso no ingirió
   documentos para ese VIN, el cajón lo dice honestamente («No hay entidad»).
   Delegación única en document: cualquier .vin-dossier abre el cajón. */
(function () {
  'use strict';

  window.vinChip = function (vin) {
    var s = String(vin == null ? '' : vin).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
    return '<button type="button" class="vin-dossier" data-vin="' + s +
      '" title="Ver el dossier de la entidad">' + s + '</button>';
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.vin-dossier');
    if (!b || !window.QualiaDossier) return;
    window.QualiaDossier.abrir(b.getAttribute('data-vin'), {});
  });
})();
