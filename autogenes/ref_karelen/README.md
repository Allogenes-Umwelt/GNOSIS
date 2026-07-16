# KARELEN / AUTOGENES — frozen reference source

This directory is a **read-only snapshot** of the AUTOGENES substrate from the
KARELEN repo (UMWELT, Next.js/TypeScript), vendored here as the specification
for the Python/Flask port on branch `AUTOGENES I`.

- **Nothing in this directory is imported, built, or executed by GNOSIS.**
- It exists so every port phase (see `docs/RUTA_CRITICA_AUTOGENES.md`) can be
  written against the exact original logic — especially the pure modules
  (`types/`, `capacidades/`, `lib/ontologia.ts`, `lib/grafo.ts`,
  `lib/pipelines/`) and the mutation law in `store/autogenes.ts`.
- The colocated `*.test.ts` files are the behavioral specification: each
  Python port must reproduce them as pytest suites before the phase closes.
- Do not edit files here. If KARELEN moves forward, re-vendor deliberately in
  a dedicated commit so the reference stays a coherent snapshot.

Snapshot taken: 2026-07-10, from KARELEN branch
`claude/gnosis-autogenes-i-85bwsd` (HEAD `4291d78`).
