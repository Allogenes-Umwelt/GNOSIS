"use client";

import { useRef, useState } from "react";
import { FunnelFormation } from "@/components/coral/FunnelFormation";
import { cn } from "@/lib/cn";

const MIMES_DOCUMENTO = ["image/png", "image/jpeg", "image/webp"];
// .txt/.md dock as citable "nota" artefactos; .json stays on the cargo path
// (it's the export/import bundle format).
const EXTENSIONES_ARTEFACTO = /\.(pdf|csv|xml|ics|xlsx|xlsm|txt|md|markdown)$/i;
const ACEPTA =
  "application/pdf,image/png,image/jpeg,image/webp,text/plain,application/json,text/csv,text/xml,text/calendar,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.txt,.md,.json,.csv,.xml,.ics,.xlsx,.xlsm";

/**
 * The intake bay — one universal mouth. Drop a file, pick one, paste
 * anything, or touch to type. At rest the six blades hold an assembled
 * pyramid; when cargo lands it fractures — the shards scatter apart,
 * contained within their window (the same break-and-float the panel
 * cubes do). Text becomes datos; PDFs and capturas dock as artefactos
 * in the AUTOGENES graph via onFile.
 */
export function IntakeBay({
  onIntake,
  onFile,
}: {
  onIntake: (text: string, sourceName?: string) => void;
  onFile?: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Cargo landing fractures the pyramid, then the intake proceeds — the
  // fracture is the load feedback (assembled at rest until then).
  function loadCargo(text: string, sourceName?: string) {
    if (text.trim().length === 0) return;
    setDragging(false);
    setBreaking(true);
    window.setTimeout(() => onIntake(text, sourceName), 520);
  }

  async function handleFile(file: File) {
    setDragging(false);
    const esDocumento =
      EXTENSIONES_ARTEFACTO.test(file.name) ||
      MIMES_DOCUMENTO.includes(file.type);
    if (esDocumento && onFile) {
      setBreaking(true);
      window.setTimeout(() => onFile(file), 520);
      return;
    }
    const text = await file.text();
    loadCargo(text, file.name);
  }

  const MAX_LOTE = 50;

  /** Batch lane (multi-select or a whole folder): supported files dock
   * one by one, spaced so each lands whole; the rest are skipped with
   * the count visible in the intake copy — never silently. */
  async function handleFiles(files: FileList | File[]) {
    const todos = Array.from(files);
    const soportados = todos
      .filter(
        (f) =>
          EXTENSIONES_ARTEFACTO.test(f.name) ||
          MIMES_DOCUMENTO.includes(f.type) ||
          /\.(txt|md|markdown|json)$/i.test(f.name),
      )
      .slice(0, MAX_LOTE);
    if (soportados.length === 0) return;
    if (soportados.length === 1) {
      void handleFile(soportados[0]);
      return;
    }
    setDragging(false);
    setBreaking(true);
    for (const [i, f] of soportados.entries()) {
      window.setTimeout(() => {
        const esDocumento =
          EXTENSIONES_ARTEFACTO.test(f.name) || MIMES_DOCUMENTO.includes(f.type);
        if (esDocumento && onFile) onFile(f);
        else void f.text().then((t) => onIntake(t, f.name));
      }, 520 + i * 400);
    }
  }

  function submitDraft() {
    if (draft.trim().length === 0) return;
    onIntake(draft);
    setDraft("");
    setTyping(false);
  }

  if (typing) {
    return (
      <div className="hud flex flex-col gap-3 p-3">
        <label
          htmlFor="intake-draft"
          className="font-mono text-micro uppercase tracking-[0.25em] text-coral-text"
        >
          Carga directa
        </label>
        <textarea
          id="intake-draft"
          autoFocus
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Pega o escribe lo que sea"
          className="w-full border border-structural bg-inset px-3 py-2.5 font-mono text-small text-frame-1 placeholder:text-frame-3 focus:border-soft focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setTyping(false);
              setDraft("");
            }}
            className="border border-structural px-4 py-2 font-mono text-micro uppercase tracking-[0.2em] text-frame-3"
            style={{ minHeight: "var(--touch-target)" }}
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={submitDraft}
            disabled={draft.trim().length === 0}
            className={cn(
              "px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em]",
              draft.trim().length > 0
                ? "bg-coral text-void"
                : "border border-structural text-frame-3",
            )}
            style={{ minHeight: "var(--touch-target)" }}
          >
            Ingresar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Carga de datos: toca para escribir, pega o suelta un archivo"
      onClick={() => setTyping(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setTyping(true);
      }}
      onPaste={(e) => {
        // A pasted screenshot rides the same route as a dropped file;
        // text keeps its lane.
        const item = Array.from(e.clipboardData.items).find((i) =>
          i.type.startsWith("image/"),
        );
        const imagen = item?.getAsFile();
        if (imagen) {
          void handleFile(imagen);
          return;
        }
        const text = e.clipboardData.getData("text");
        if (text.trim().length > 0) loadCargo(text);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          void handleFiles(e.dataTransfer.files);
        } else {
          const text = e.dataTransfer.getData("text");
          if (text.trim().length > 0) loadCargo(text);
        }
      }}
      className={cn(
        "hud flex min-h-72 cursor-pointer flex-col items-center justify-center gap-5 px-6 py-10 text-center outline-none",
        dragging && "hud-live border-coral",
        "focus-visible:border-soft",
      )}
    >
      <FunnelFormation awake={dragging} breaking={breaking} className="h-36" />
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-small font-bold uppercase tracking-[0.4em] text-frame-1">
          Carga de Datos
        </p>
        <p className="max-w-56 text-caption leading-relaxed text-frame-3">
          Elige archivos, una carpeta o una captura — o toca para escribir.
          Los documentos se dockean al grafo (hasta 50 por lote).
        </p>
      </div>
      {/* Native label → input: opens the picker reliably on mobile,
          where a synthetic .click() on a hidden input is flaky. */}
      <label
        htmlFor="intake-file"
        onClick={(e) => e.stopPropagation()}
        className="hud-btn inline-flex cursor-pointer items-center justify-center border border-coral px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
        style={{ minHeight: "var(--touch-target)" }}
      >
        Elegir archivo
      </label>
      <input
        id="intake-file"
        ref={fileRef}
        type="file"
        accept={ACEPTA}
        multiple
        className="sr-only"
        aria-label="Elegir archivos para cargar"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0)
            void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Folder lane: docks every supported file inside (max 50). */}
      <label
        htmlFor="intake-carpeta"
        onClick={(e) => e.stopPropagation()}
        className="hud-btn inline-flex cursor-pointer items-center justify-center border border-structural px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-frame-2"
        style={{ minHeight: "var(--touch-target)" }}
      >
        Cargar carpeta
      </label>
      <input
        id="intake-carpeta"
        type="file"
        multiple
        {...({ webkitdirectory: "" } as Record<string, string>)}
        className="sr-only"
        aria-label="Elegir carpeta para cargar"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0)
            void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Direct camera lane — its own input so the main picker keeps
          offering gallery and files (capture would suppress them). */}
      <label
        htmlFor="intake-camara"
        onClick={(e) => e.stopPropagation()}
        className="hud-btn inline-flex cursor-pointer items-center justify-center border border-structural px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-frame-2"
        style={{ minHeight: "var(--touch-target)" }}
      >
        Tomar foto
      </label>
      <input
        id="intake-camara"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Tomar foto para cargar"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
