"use client";

/**
 * On-canvas navigation controls shared by every QUALIA render: zoom in,
 * zoom out, and reframe (panorámica). Touch-sized, coral over a blurred
 * void so they read against any content.
 */
export function ControlesZoom({
  onZoom,
  onFit,
}: {
  onZoom: (factor: number) => void;
  onFit: () => void;
}) {
  return (
    <div className="absolute bottom-2 right-2 flex flex-col gap-1">
      <Boton etiqueta="Acercar" signo="+" onClick={() => onZoom(1.3)} />
      <Boton etiqueta="Alejar" signo="−" onClick={() => onZoom(1 / 1.3)} />
      <Boton etiqueta="Panorámica" signo="◇" onClick={onFit} />
    </div>
  );
}

function Boton({
  etiqueta,
  signo,
  onClick,
}: {
  etiqueta: string;
  signo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="flex h-10 w-10 items-center justify-center border border-frame-3/40 bg-void/70 font-display text-small font-bold text-coral-text backdrop-blur-sm"
    >
      {signo}
    </button>
  );
}
