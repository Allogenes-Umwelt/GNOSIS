"use client";

import { useSyncExternalStore } from "react";
import { RedTopologia } from "@/microapps/signature/RedTopologia";
import { manifiestoSignature } from "@/microapps/signature/manifest";

const subscribeNoop = () => () => {};

/**
 * SIGNATURE — the recombination studio. Its own capability: it takes the
 * operator's sources, projects them into a network, and elevates them
 * through deep-tech lenses. It has its own ingesta and reads AUTOGENES
 * only when the operator opts in — nothing here sends the operator to the
 * substrate to load data. The legacy autogenes-basic study module was
 * retired from Signature's face (its code stays in EstudioPanel.tsx for
 * relocation).
 */
export function SignatureView() {
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  return (
    <section className="flex flex-1 flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-head-sm font-bold uppercase tracking-[0.2em] text-frame-1">
          {manifiestoSignature.nombre}
        </h1>
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
          Estudio de recombinación
        </p>
        <p className="max-w-prose text-caption leading-relaxed text-frame-3">
          {manifiestoSignature.descripcion}
        </p>
      </header>

      {hydrated ? <RedTopologia /> : null}
    </section>
  );
}
