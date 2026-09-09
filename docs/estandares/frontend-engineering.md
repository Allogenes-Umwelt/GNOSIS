---
id: frontend-engineering
title: Frontend Engineering Skill Set
version: 1.3.1
status: active
owner: CLARENT
audience: ALLOGENES
domain: [frontend, typescript, accessibility, performance, security, web]
activation:
  triggers:
    - "building or reviewing a browser client"
    - "deciding on rendering strategy, state, or data fetching"
    - "auditing accessibility, Core Web Vitals, or bundle size"
    - "wiring a client to an API, or handling auth in a browser"
  scope: "Browser clients, TypeScript-first, professional to elite level"
  excludes: "native mobile, backend services, model training"
extends: []
requires: [backend-engineering, application-security, api-design]
see_also: [llm-engineering]
manual_scores:
  density: 14
  editions: 5
  scored_by: Fable 5.1
  scored_at: 2026-09-08
  defended_in: reports/audit-v7.md
  fingerprint: 328e6d647d571f5caeb4befd050edf2c
updated: 2026-09-08
review_by: 2027-03-08
---

# Frontend Engineering Skill Set

The sibling to `backend-engineering`, which owns the doctrine, the wave
workflow, and the API contract this file consumes. Read that first; the
rules there about defaults being binding, benchmarks being the contract,
and ADRs for deviation all hold here unchanged.

The frontend is where the product is judged and where the user's device,
network and body are the runtime. Nothing here is cosmetic.

---
## 1. Language & types

- **TypeScript, `strict: true`**, plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `verbatimModuleSyntax`. Strict-by-default costs a week once; strict
  retrofitted onto 80k lines costs a quarter.
- `any` is a defect with a comment. `unknown` at boundaries, then narrow.
  Ban it with `@typescript-eslint/no-explicit-any` and allow exceptions by
  name, not by silence.
- **Types at the boundary are not trust.** A TypeScript interface is
  erased at runtime; a JSON response is untyped bytes. Validate with Zod
  or Valibot at the edge and infer the type from the schema, so there is
  one source of truth rather than a type and a validator that drift.
- Prefer discriminated unions over optional-field soup. A state that is
  `{loading, error, data}` all-optional has eight representable
  combinations and four legal ones — model the four (§2.1).
- `readonly` and `as const` by default; mutation is the exception you
  justify. Branded types for IDs, so an `OrderId` cannot be passed where a
  `UserId` belongs.
- Tooling: one toolchain, pinned. Vite or the framework's own; `pnpm`
  with a committed lockfile; Biome or ESLint + Prettier, never both
  fighting. Node version pinned in `.nvmrc` and in CI.

**When not to**: `exactOptionalPropertyTypes` on a codebase mid-migration
from loose types. Land `strict` first; the granular flags are worth more
once the baseline holds.

**How it goes wrong**: `any` at the API boundary because the response
"was already typed" on the backend — and a renamed field ships as
`undefined` through four components before anyone sees a blank screen.

#### Audit Benchmarks
- Types: `tsc --noEmit` clean under `strict`. Enforcer: CI.
- Escape hatches: zero `any` or `@ts-ignore` without a named, dated
  reason. Enforcer: `@typescript-eslint`.
- Boundaries: 100% of network responses parsed by a runtime schema.
  Enforcer: lint rule banning raw `res.json()` outside the API layer.
- Reproducibility: lockfile committed; CI installs frozen and fails on
  any drift; Node version pinned. Enforcer: `pnpm install
  --frozen-lockfile` plus an `.nvmrc` check.

---
## 2. Architecture & state

### 2.1 State discipline
Most frontend complexity is state kept in the wrong place. Sort it first.

| Kind | Lives in | Tool |
|---|---|---|
| Server state (fetched, cached, stale) | a query cache | TanStack Query, RTK Query |
| URL state (filters, tabs, pagination) | the URL | router params |
| Form state | the form | React Hook Form, framework equivalent |
| Ephemeral UI state (open, hovered) | the component | local state |
| Genuine global state | a store, small | Zustand, Redux Toolkit, signals |

The tool column is one ecosystem's answer. Every framework has an
equivalent for each row; the placement is the rule, the names are not.

- **Server state is not global state.** Putting fetched data in a global
  store means you own caching, invalidation, refetching, deduplication and
  staleness by hand. That is the library's job and it is a solved problem.
- The URL is state. A filtered view the user cannot bookmark or share is a
  bug, and it is the most-reported one that never gets filed.
- Derive, do not duplicate. Two fields that must agree will disagree.

### 2.2 Rendering strategy
- Choose per route, not per application: static (SSG) when content is
  shared and cacheable; server-rendered when it is personalised and
  first-paint matters; client-only for an authenticated app shell behind a
  login; streaming/islands when the page is mostly static with live parts.
- **Server-render by default for anything public.** Pay: a server and its
  ops. Gain: first paint, and content a crawler and a screen reader see
  without executing your JavaScript.
- Component boundaries follow data boundaries, not visual ones. A
  component that takes twelve props is usually two components and a layout.
- Colocate by feature, not by type. `features/checkout/` beats
  `components/`, `hooks/`, `utils/` at any size past a weekend project.

**When not to**: a global store for a form and two toggles. The table is a
placement guide, not a shopping list; most screens need the URL and local
state and nothing else.

**How it goes wrong**: a filter panel whose state lives in a component,
so the URL never changes — and the support team cannot reproduce a single
reported bug, because no user can send them the view they are looking at.

#### Audit Benchmarks
- Placement: zero server-fetched data held in a global store. Enforcer:
  review checklist + architecture test.
- URL state: zero filter or tab state absent from the URL on a shareable
  view. Enforcer: E2E test that a copied URL restores the view.
- Boundaries: import rules enforce feature isolation — no cross-feature
  deep imports. Enforcer: `eslint-plugin-boundaries` or `dependency-cruiser`
  in CI.
- Rendering: a documented strategy per route, reviewed when it changes.
  Enforcer: ADR + review.

---
## 3. The API contract

The backend's obligations are in `api-design` §8. These are the client's
side of the same contract.

- **The client is generated, not hand-written.** Generate types and a
  client from the OpenAPI document in CI (`openapi-typescript`,
  `orval`, or the framework's codegen). A breaking backend change then
  fails your build instead of your users.
- Never hand-maintain a duplicate of a backend type. It will drift, and it
  will drift silently in the direction that ships.
- Handle the contract's semantics, not just its happy path: RFC 9457
  problem details switched on `type`, 429 with `Retry-After` honoured,
  409 and 412 surfaced as real conflicts rather than "something went
  wrong", cursor pagination, `Idempotency-Key` on retryable creates.
- Money is integer minor units and a currency code. Never a float, never
  formatted server-side for a client that might localise differently. IDs
  are strings — JavaScript loses integer precision above 2^53, and the bug
  appears only when the table gets big.
- Timezones: store and transmit UTC, render in the user's zone with
  `Intl`. Do not hand-roll offsets.
- Optimistic updates need a rollback path and a conflict story. Optimism
  without either is data loss with a smooth animation.

**When not to**: generating a client for an API you own, in one repo, with
one consumer. A shared type package is less machinery for the same
guarantee.

**How it goes wrong**: an optimistic update with no rollback path, so a
429 leaves the UI showing a saved record the server rejected — and the
user only learns on the next reload, having already moved on.

#### Audit Benchmarks
- Generation: the API client is generated in CI and the build fails on a
  contract change; zero hand-written duplicates of backend types.
  Enforcer: codegen job + diff check.
- Semantics: 429, 409 and 412 are handled distinctly from generic errors,
  with a test each. Enforcer: CI tests.
- Money: zero floats for money. Enforcer: schema lint.
- Identifiers: zero numeric IDs from the API. Enforcer: schema lint.

---
## 4. Performance

### 4.1 Core Web Vitals
The field measurement is what counts: **p75, segmented by mobile and
desktop**. A lab score on your laptop is a smoke test, not a result.

| Metric | Good | Measures |
|---|---|---|
| LCP — Largest Contentful Paint | <= 2.5s | loading |
| INP — Interaction to Next Paint | <= 200ms | responsiveness |
| CLS — Cumulative Layout Shift | <= 0.1 | visual stability |

INP replaced First Input Delay as a stable Core Web Vital in 2024. It is
strictly harder to pass: FID measured only the first interaction's delay,
INP measures the worst interaction's full duration to next paint. Long
tasks that were previously invisible now score.

- LCP: the hero image is `fetchpriority="high"`, preloaded, correctly
  sized and modern-format. Fonts get `font-display: swap` and a preload;
  a webfont blocking first paint is a self-inflicted LCP failure.
- INP: break up long tasks, `scheduler.yield()` where available, keep
  event handlers off the critical path, and virtualise long lists. Most
  INP failures are one synchronous handler doing layout work.
- CLS: dimensions on every image and embed, space reserved for anything
  injected late (banners, ads, consent dialogs), and no font swap that
  reflows.

### 4.2 Budgets
- **Bundle budgets in CI, failing the build.** A budget that only warns is
  a budget that is already exceeded. Per-route JavaScript, not total.
- Ship less: code-split by route, lazy-load below the fold, tree-shake,
  and check what a dependency costs before adding it. A date library at
  70KB to format one timestamp is a decision, and usually the wrong one.
- Images: modern formats, responsive `srcset`, lazy below the fold,
  explicit dimensions.

**When not to**: micro-optimising a route nobody visits. Rank by traffic
times distance from the threshold, and fix the top of that list.

**How it goes wrong**: a third-party tag manager added by marketing,
loading synchronously, adding 400ms to LCP on every page — and invisible
in CI because CI does not load third parties.

#### Audit Benchmarks
- Field: LCP <= 2.5s, INP <= 200ms, CLS <= 0.1 at p75 on mobile and
  desktop (floor: measured and reported; elite: enforced as an SLO with an
  error budget). Enforcer: RUM dashboard + alert.
- Budgets: per-route JavaScript budget fails the build when exceeded.
  Enforcer: `size-limit` or bundler budget in CI.
- Lab: lab performance measured on the top five routes per PR, with no
  regression beyond a set threshold. Enforcer: a lab-performance runner in
  CI (Lighthouse CI).
- Third parties: every third-party script has an owner, a business reason,
  and a measured cost, reviewed quarterly. Enforcer: script inventory.

---
## 5. Accessibility

Not a feature and not a phase. **WCAG 2.2 Level AA** is the standard
(W3C Recommendation, October 2023); the European Accessibility Act has
been enforceable since 28 June 2025 and mandates it for digital products
sold in the EU. WCAG 3.0 is a Working Draft — a Recommendation is not
expected before 2028, and its Bronze level is roughly today's 2.2 AA, so
conforming now is the head start.

- **Semantic HTML first.** A `<button>` is focusable, keyboard-operable,
  announced correctly and free. A `<div onclick>` is none of those and
  costs you three ARIA attributes to half-fix.
- The first rule of ARIA is not to use ARIA. Reach for it only when no
  native element expresses the semantics.
- Keyboard: every interactive element reachable and operable, a visible
  focus indicator, a logical tab order, no keyboard traps, and a skip
  link. Test by unplugging the mouse.
- Focus management is the part SPAs get wrong: move focus on route change,
  return it when a dialog closes, and announce async updates through a
  live region.
- Forms: a real `<label>` for every control, errors linked by
  `aria-describedby`, errors announced not just coloured, and validation
  that does not fire on every keystroke.
- Contrast 4.5:1 for body text, 3:1 for large text and UI boundaries.
  Never colour alone to convey meaning.
- Respect `prefers-reduced-motion`, `prefers-color-scheme`, and user font
  size — a layout that breaks at 200% zoom fails 1.4.4.
- Automated tooling catches roughly a third of issues. `axe` in CI is the
  floor; keyboard and screen-reader passes (NVDA, VoiceOver) are the rest,
  and testing with actual users is the only thing that finds the last mile.

**When not to**: an accessibility audit as a pre-launch phase. Retrofitting
semantics into a shipped component library costs more than building on
`<button>` did, and the fix list arrives when there is no time for it.

**How it goes wrong**: a `<div onclick>` modal with no focus trap, so a
keyboard user tabs out of the dialog into the page behind it and cannot
find their way back to the close control.

#### Audit Benchmarks
- Automated: zero automated WCAG 2.2 AA violations on every route.
  Enforcer: an accessibility engine in component and E2E tests, in CI
  (`axe-core`).
- Keyboard: every interactive element is reachable, operable,
  focus-visible and free of traps, checked per feature. Enforcer: E2E
  keyboard test + review checklist.
- Manual: a screen-reader pass per release on critical journeys, signed
  and dated in the release notes (floor); usability testing with disabled
  users annually (elite). Enforcer: **ritual** -- the signed note is the
  artifact, and no tool can produce it.
- Conformance: a WCAG 2.2 AA statement maintained and dated; EAA
  applicability assessed. Enforcer: accessibility audit, annual.
- Zoom and motion: usable at 200% zoom; `prefers-reduced-motion` honoured.
  Enforcer: E2E viewport test + review.

---
## 6. Security

The backend's obligations are in `application-security`. These are the
ones the browser owns.

- **Auth via the BFF.** Tokens never touch `localStorage` or
  `sessionStorage` — anything XSS can read, XSS will exfiltrate. The
  session is a `__Host-` prefixed, `httpOnly`, `SameSite` cookie issued
  by the backend (`api-design` §8). If you are storing a JWT in
  web storage, that is the finding.
- **CSP with nonces**, not `unsafe-inline`. A hash- or nonce-based policy
  is the difference between a CSP that stops XSS and one that decorates
  the response headers.
- **Trusted Types.** `require-trusted-types-for 'script'` makes DOM XSS
  sinks reject raw strings outright. Baseline since February 2026, so the
  objection that it was Chrome-only no longer holds. Adopt it.
- Sanitize any HTML you must render (DOMPurify). Better: do not render
  user HTML.
- `target="_blank"` gets `rel="noopener"`. Never put a secret in the
  bundle — everything shipped to the browser is public, including that
  "internal" API key.
- Dependencies are the largest attack surface you do not write:
  `pnpm audit` or `osv-scanner` in CI, a cooldown before adopting new
  releases, and Subresource Integrity on anything loaded from a CDN.
- Report CSP violations to an endpoint and actually read them; they are
  the earliest signal of an injection attempt.

**When not to**: `unsafe-inline` "temporarily" to ship a third-party
widget. That temporary exception is the CSP, and it will outlive the
widget.

**How it goes wrong**: a CSP shipped in report-only mode "until the
violations settle down", still report-only two years later, with an
endpoint nobody has read since the week it was added.

#### Audit Benchmarks
- Token storage: zero tokens in `localStorage`, `sessionStorage`, or
  non-`httpOnly` cookies. Enforcer: lint rule + ZAP baseline.
- CSP: nonce- or hash-based, with no `unsafe-inline` or `unsafe-eval`.
  Enforcer: header test in CI.
- CSP reports: every violation report reaches an endpoint someone triages.
  Enforcer: report endpoint with an owner.
- Trusted Types: `require-trusted-types-for 'script'` enforced. Enforcer:
  header test in CI.
- Dependencies: zero known criticals; SRI on external scripts. Enforcer:
  `osv-scanner` in CI.
- Secrets: zero secrets in client bundles. Enforcer: `gitleaks` + a bundle
  scan in CI.

---
## 7. Testing

- **Test behaviour through the accessibility tree.** Testing Library's
  `getByRole` is not a style preference: a test that cannot find the
  button by its role is telling you a screen reader cannot either. Your
  accessibility tests and your component tests become the same tests.
- Layers: unit for logic; component tests (Vitest + Testing Library) for
  most of it; E2E (Playwright) for critical journeys only — the same
  pyramid discipline as `backend-engineering` §8, and the same rule that a
  flaky test is a bug, never weather.
- Mock the network at the boundary with MSW, not by stubbing your own
  fetch wrapper. Then the test exercises the code that parses the
  response, which is where the bugs are.
- Visual regression on the design system, not on every page. Snapshot the
  components; assert behaviour on the screens.
- Cross-browser and real devices for critical journeys. A mid-range
  Android on a throttled connection is the honest test, and it is where
  INP failures actually live.
- Test the states that ship broken: loading, empty, error, offline,
  slow, long text, RTL, and 200% zoom.

**When not to**: a real-device lab before a throttled mid-range profile
in CI. The profile catches most of what the lab would, on every PR rather
than per release, and it costs nothing to keep.

**How it goes wrong**: a suite that selects everything by `data-testid`,
passing perfectly while the submit button has no accessible name — the
tests and the screen reader disagree, and only one of them is shipping to
users.

#### Audit Benchmarks
- Query discipline: component tests query by role or label; zero test IDs
  as the primary selector. Enforcer: `eslint-plugin-testing-library`.
- Coverage: diff coverage >= 80% (floor); >= 90% with the critical
  journeys under E2E (elite). Enforcer: `diff-cover` in CI.
- States: every data-driven view has loading, empty and error tests.
  Enforcer: review checklist.
- Trust: zero configured retries in CI. Enforcer: CI config.
- Flakes: every flaky test fixed or deleted within 7 days. Enforcer: flake
  dashboard with an age column.
- Devices: critical journeys pass on a throttled mid-range mobile profile
  per release. Enforcer: Playwright device project in CI.

---
## 8. Design system & internationalization

- **Design tokens are the contract** between design and code: colour,
  spacing, type, radius, motion, elevation — defined once, consumed
  everywhere, versioned. A hex code in a component is a token that escaped.
- Components are accessible by construction, so correctness is inherited
  rather than re-litigated per feature. Document them where they are used
  (Storybook), with the props and the accessible behaviour.
- Theming through tokens and CSS custom properties. Dark mode is a token
  set, not a second stylesheet.
- **i18n from the first line, even for one language.** Retrofitting
  extraction into 60k lines of hardcoded strings is a quarter nobody
  budgets. Externalise strings, use ICU message format for plurals and
  gender, and never concatenate sentence fragments — grammar is not
  string addition.
- Format numbers, dates, currency and lists with `Intl`, in the user's
  locale.
- RTL from the start: logical CSS properties (`margin-inline-start`, not
  `margin-left`). Retrofitting direction is a full restyle.
- Budget for text expansion — German and Finnish run 30-40% longer than
  English, and a fixed-width button is a truncation bug in three locales.

**When not to**: a full design system for one product with three screens.
Tokens first — they are most of the value; the component library can wait
until there is a second consumer.

**How it goes wrong**: a hex colour typed straight into a component
because it was "just this one card", and dark mode shipping with one
white rectangle nobody caught until a user posted a screenshot.

#### Audit Benchmarks
- Tokens: zero hardcoded colour or spacing values outside the token
  definitions. Enforcer: stylelint rule in CI.
- Components: every design-system component renders in isolation and
  passes the automated accessibility check. Enforcer: CI (a component
  workshop such as Storybook, plus `axe-core`).
- Strings: zero hardcoded user-facing strings outside the locale files.
  Enforcer: i18n extraction lint.
- Direction: logical properties only; RTL smoke test per release.
  Enforcer: stylelint + E2E.

---
## 9. Observability

- **Error tracking with source maps** (Sentry or equivalent), uploaded
  privately at build time and not served to the public. A minified stack
  trace is not a bug report.
- Errors are grouped, owned and triaged. An error dashboard nobody reads
  is a cost centre.
- **Real-user monitoring** for Core Web Vitals, segmented by device,
  connection and route. Aggregate numbers hide the mid-range Android where
  the problem lives.
- Error boundaries around routes and risky widgets, with a real fallback.
  A blank white page is the worst failure mode you can ship.
- Correlate with the backend: propagate the trace context so a frontend
  error links to the server span that caused it
  (`backend-engineering` §10).
- Privacy is part of this: no PII in error payloads or session replays,
  masking on by default, and consent respected before any of it loads.

**When not to**: session replay on every user, at full fidelity, forever.
Sample it, mask it, and set a retention period.

**How it goes wrong**: source maps uploaded publicly alongside the bundle,
handing an attacker your unminified source — and the error dashboard so
noisy from one third-party script that nobody noticed the real regression
for a week.

#### Audit Benchmarks
- Errors: source maps uploaded privately and never publicly served; zero
  unminified stack traces in triage. Enforcer: build step + bundle check.
- Triage: every error group has an owner; new groups reviewed weekly.
  Enforcer: error tracker workflow.
- RUM: Core Web Vitals reported at p75 segmented by device and route.
  Enforcer: RUM dashboard.
- Resilience: error boundaries on every route with a tested fallback.
  Enforcer: component test.
- Privacy: zero PII in error payloads or replays; masking on by default;
  consent gates loading. Enforcer: payload scrubber test + review.

---
## 10. Model-backed UI

The client half of `llm-engineering`. That file owns the model, the evals
and the budget; this is what the browser owes a user who is watching one
think.

- **Stream it.** A model call takes seconds, and a spinner for seconds
  reads as broken. Stream tokens, show progress, and give the user
  something to read while the rest arrives.
- **Model output is untrusted input** (`llm-engineering` §0), and the
  browser is where that becomes XSS. Never render it as HTML unsanitised —
  Trusted Types (§6) applies to this sink exactly as it does to any other.
  Markdown is not a safe subset by default; the renderer's HTML passthrough
  is the hole.
- Citations are links that resolve. An answer citing a source the user
  cannot open is an answer they cannot check
  (`llm-engineering` §4.5).
- **Refusals and errors are product states with a UX**, not exceptions to
  swallow. "I can't help with that" needs a next step; a provider timeout
  needs a retry the user controls.
- No model call on a keystroke. An explicit action, or a debounce with a
  stated interval — otherwise every draft costs money and the user cannot
  tell which response belongs to which edit.
- Cancel and progress on anything long. A generation the user cannot stop
  is a bill they cannot stop.
- Show cost where the user pays it: remaining quota, tokens used, or the
  plan limit they are approaching.

**When not to**: streaming a one-word classification. The machinery costs
more than the wait, and a result that appears atomically reads as more
certain — which, for a classification, it is.

**How it goes wrong**: a chat surface renders the model's markdown through
a library with HTML passthrough on. A retrieved document contains an
`<img onerror=...>`, the model quotes it faithfully, and prompt injection
becomes stored XSS in the one place every user looks.

#### Audit Benchmarks
- Rendering: zero model output rendered as unsanitised HTML; Trusted Types
  enforced on the sink. Enforcer: lint rule + header test in CI.
- Streaming: 100% of generations over 1s stream, with a working cancel.
  Enforcer: component test.
- Citations: 100% of cited sources resolve to something the user can open.
  Enforcer: E2E test.
- States: refusal, timeout and rate-limit each have a tested UI state.
  Enforcer: component test.
- Spend: zero model calls fired per keystroke; cost or quota visible where
  the user pays. Enforcer: review checklist + RUM.
