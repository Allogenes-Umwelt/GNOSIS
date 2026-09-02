# Architecture Standards — engineering doctrine, ANY repo

Scope: repo-agnostic baseline for architecture documentation and diagrams.
Applies to every repo we work with; per-repo AGENTS.md pins stack specifics
and points here. Playbook: skill `architecture-diagram` (the how-to, loaded on
demand). GESTELL-branded artifacts also follow the GESTELL document contract
(`~/gestell-documentos-guia.md` — brand OS: fonts, isotipo, dual theme, AAA;
lifted from GNOSIS `docs/GUIA_DOCUMENTOS_GESTELL.md`).

---

## 1. Notation — default is C4 + arc42

C4 model (Simon Brown), four levels. Each level is a white box of the level
above: L1 is the only black box; L2–L4 progressively open one box at a time.

| Level | View | Box semantics | Question it answers |
| --- | --- | --- | --- |
| L1 | Context | System = black box; actors + external systems | What is this in its environment? |
| L2 | Containers | System = white box: deployable/executable pieces + comms | What are the pieces and how do they talk? |
| L3 | Components | One container = white box: its internal components | What is inside this container? |
| L4 | Code | One component = white box: classes/modules | How does this piece actually work? |

Documents: **arc42** structure (12 sections, see skill template). Supplemental
notations for specific questions: ER (`erDiagram`) for data models, sequence
for time-ordered interaction, state machines, deployment diagrams, BPMN-style
flowcharts for processes. **ArchiMate only when the boundary is the
enterprise, not the system.**

## 2. Diagrams-as-code, single source of truth

- Source of truth is TEXT in the repo: Mermaid for repo docs (renders on
  GitHub); Structurizr DSL for systems large enough to need validation and
  multiple render targets.
- Generated images (PNG/SVG) are artifacts — never the source. No
  hand-maintained binaries.
- One file per view, named by level: `docs/architecture/context.md`,
  `containers.md`, `components/<container>.md` (extensions per tool).

## 3. Craft rules (enforced, not suggested)

- Every diagram carries: title, notation/level, legend, and the question it
  answers. A diagram without these four is not done.
- One level per diagram. Never mix C4 levels in one image.
- Max ~6 elements per view; beyond that, split into sub-views. A map is not
  a diagram.
- Every edge labeled and directional. Unlabeled edges are a guess.
- Semantic color only, via Mermaid `classDef`: gate/alert = magenta
  (telos/umwelt), accent = cyan (gnosis), neutrals from tokens. **Magenta is
  reserved for real alert — never decoration, never selection.** (GESTELL
  law, codified from GNOSIS `COTEJO_QUALIA_GNOSIS.md`: selection is marked by
  opacity/attenuation in accent, not by color.)
- AAA contrast in both themes (Nocturne / Daylight) for branded artifacts.

## 4. White-box law (L3 and L4)

- Open exactly ONE box per diagram: show the internals of the container in
  question; everything else stays a named external reference.
- Component names come from the code — module/file/package names. No invented
  services, no aspirational architecture.
- Edges crossing the boundary must match the parent diagram's edges. A
  white-box view that contradicts its black-box parent is a defect.
- L4 only when it answers a real question (a specific algorithm, dependency,
  or state change). Otherwise stop at L3.

## 5. ADRs — decisions and diagrams are one system

- Any structural change (new container/component/route/boundary move)
  requires an Architecture Decision Record with the change.
- The ADR names the affected diagrams; the diagram's caption or legend cites
  the ADR. One without the other is incomplete.

## 6. Living documentation — anti-rot

- Diagrams update in the SAME change that alters the architecture. If code
  moves, the diagram moves in the same commit.
- Staleness rule: a merged change that touched a component named in a diagram
  without touching the diagram fails the gate.

## 7. CI gates — mechanical enforcement ("executed", not suggested)

- Mermaid blocks parse headless, zero errors (HARD):
  `node scripts/validate-mermaid.mjs docs/architecture` (script ships with
  skill `architecture-diagram`; structural pre-flight always, full parse when
  mermaid + jsdom deps installed).
- Staleness (HARD): structural change (src/, server/, electron/ — tests,
  styles, docs, scripts exempt) without a `docs/architecture/` update in the
  same diff fails:
  `node scripts/check-diagram-staleness.mjs --base HEAD~1` (same skill).
- ADR (SOFT until an ADR corpus exists): the staleness script warns when a
  structural change touches no ADR; review enforces the requirement. Once the
  repo has ADRs, this becomes a hard gate.
- Structurizr DSL validates: `structurizr-cli validate` when DSL is in use.

GHA recipe:

```yaml
- name: Validate Mermaid diagrams
  run: |
    node scripts/validate-mermaid.mjs docs/architecture
- name: Validate Structurizr (if DSL in use)
  run: docker run --rm -v $PWD:/wd -w /wd structurizr/cli validate -w docs/architecture/workspace.dsl
```

## 8. Agent verification — before delivering

- Render what you write (mermaid-cli / structurizr-cli / plantuml / d2),
  inspect the image, iterate. Never ship unrendered or fabricated diagrams.
- Same law as reviews: no output you did not verify.

## 9. Per-repo pointer (AGENTS.md)

Every repo's AGENTS.md carries a short section:

```
## Architecture documentation
- C4 (Context → Container → Component) + arc42, per ~/architecture-standards.md — the doctrine for ANY repo.
- Diagrams-as-code in docs/architecture/; structural change requires an ADR + diagram update in the same commit.
- Playbook: skill architecture-diagram. Validator: scripts/validate-mermaid.mjs.
```

## 10. Pre-merge quality gate — a diagram in any diff must pass

- [ ] title / legend / level / question present
- [ ] one level only; ~6 elements max
- [ ] all edges labeled and directional
- [ ] names match code; no invented internals (white-box law)
- [ ] semantic colors only; magenta only for real alert
- [ ] ADR exists if structural
- [ ] rendered and inspected (agent) or parse-validated (CI)
- [ ] not stale: diagram touched in the same commit as the code
