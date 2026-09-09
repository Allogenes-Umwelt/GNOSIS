---
id: llm-engineering
title: LLM Engineering
version: 1.2.1
status: active
owner: CLARENT
audience: ALLOGENES
domain: [ai, llm, evals, rag, agents, guardrails, cost]
activation:
  triggers:
    - "building or reviewing a feature that calls a language model"
    - "designing retrieval, an agent, or a tool surface for a model"
    - "writing or debugging evals, or judging whether a change helped"
    - "budgeting cost and latency for a model-backed feature"
    - "deciding what data may reach a model provider"
  scope: "Engineering with language models, provider-neutral, professional to elite"
  excludes: "model training, research, prompt-writing craft, legal interpretation"
extends: []
requires: [backend-engineering, application-security]
see_also: [frontend-engineering]
manual_scores:
  density: 14.5
  editions: 5
  scored_by: Fable 5.1
  scored_at: 2026-09-08
  defended_in: reports/audit-v7.md
  fingerprint: 5f7c46480787ae24436b057662cb368f
updated: 2026-09-08
review_by: 2027-03-08
---

# LLM Engineering

The playbook behind `backend-engineering` §14. That section states the
rules; this file explains how to meet them and what each one costs. The
doctrine, the wave workflow and the quality gates all live there and hold
here unchanged.

**Provider-neutral by rule.** No model IDs and no prices: both rot within
months, and a document naming last quarter's model teaches last quarter's
mistake. Capability tiers and features instead, with availability stated
as varying.

---
## 0. Doctrine for non-deterministic systems

- **Non-determinism is the runtime.** The same input yields different
  outputs, so correctness is a distribution and not a value. Every claim
  in this file about model behaviour is settled by an eval, never by an
  opinion or a demo.
- **The model is a dependency** (§1). It has a version, a deprecation
  date, a changelog and a supplier who can change it under you.
- **Its output is untrusted input** (`backend-engineering` §14). Closer
  to a form submission than to a return value.
- **The controls live outside the model.** This is the thesis of the whole
  file. A prompt is not a security control, a reliability control, or a
  cost control — because an instruction competes with every other
  instruction in the context, including one an attacker put there. What
  actually holds is what the model is *permitted to do* (§5), what its
  output is permitted to reach (§6), and what it is permitted to spend
  (§7).
- **Cost is a metric with an owner** (§7), not a line on an invoice
  someone discovers at month end.

Doctrine is not a domain; it carries no benchmarks. Everything below does.

---
## 1. Models as dependencies

### 1.1 Selection
- **Build the eval first, then run candidates through it** (§3). Public
  leaderboards measure the leaderboard; your task is not on it, and the
  gap between two models on a benchmark is rarely the gap on your work.
- Think in tiers, not products: **small** for classification, extraction
  and routing; **mid** for transformation and summarisation; **frontier**
  for reasoning, planning and agentic work. The tier is a decision with an
  eval behind it (§7.3).
- Properties that decide a choice, in rough order of how often they do:
  task accuracy on *your* eval, tool-use reliability, context window,
  latency profile, cost per million tokens, data residency, and whether
  you can self-host.
- Open-weight versus API is usually settled by one row of the table, and
  it is almost always residency or volume — not capability.

| | Open-weight, self-hosted | Provider API |
|---|---|---|
| Data residency | yours entirely | contractual (§9) |
| Cost shape | fixed (GPUs) | variable (tokens) |
| Ops burden | serving, scaling, upgrades | none |
| Capability | lags the frontier | current |
| Fine-tuning | full access | limited or none |
| Best when | volume is high and steady, or data cannot leave | volume is spiky, or you need frontier capability |

### 1.2 Pinning and succession
- **Pin the model identifier. Never a floating alias.** An alias means the
  supplier can change your product's behaviour without a deploy, and your
  first signal is a support ticket.
- Providers retire models on their schedule. Subscribe to the deprecation
  channel, and have the successor **evaluated before the notice expires**,
  not after.
- A **fallback is a model that passes the same evals**. A fallback that
  has not been evaluated is a different product behind the same button,
  and it will be serving your users at exactly the moment nobody is
  watching.
- Model upgrades go through a PR with an eval diff attached and a
  changelog entry, like any other dependency bump.

### 1.3 Fine-tuning
- Last resort, not first. Exhaust prompting, structured outputs (§2.3)
  and retrieval (§4) first — they are cheaper to change and cheaper to
  reverse.
- Fine-tune for **format, style, latency, or a narrow classifier**. Do not
  fine-tune for knowledge: it goes stale, it cannot be updated per query,
  and you cannot cite it.
- Pay: an eval set and a data pipeline you now own forever, plus a
  retraining bill every time the base model moves.

### 1.4 Context economics
- A larger context window is not free. Cost scales with input, and
  attention degrades in the middle of long inputs — performance is highest
  when the relevant material sits at the beginning or the end (Liu et al.,
  "Lost in the Middle", 2023).
- Long context is a tool, not a substitute for retrieval. Put the
  important material at the edges, and prefer fetching ten relevant
  chunks over stuffing a hundred.

**When not to**: switching models to chase a benchmark delta smaller than
your own eval's confidence interval. That is noise with a migration cost.

**How it goes wrong**: a fine-tune trained for knowledge rather than
format, shipped in March and confidently wrong about anything that
changed in April — and unfixable per query, because the facts are in the
weights and there is nothing to cite.

#### Audit Benchmarks
- Pinning: zero floating model aliases in any configuration. Enforcer:
  config lint in CI.
- Succession: every model in production has a monitored deprecation date.
  Enforcer: dependency inventory.
- Successors: every model in production has an evaluated successor at
  least 60 days before its deprecation date. Enforcer: calendar + a stored
  eval run.
- Fallback parity: every fallback passes the primary's golden set at >= 95%
  of the primary's score. Enforcer: eval job over both.
- Provenance: every model choice links the eval run that decided it.
  Enforcer: ADR + stored eval artifact.

---
## 2. Prompts as code

### 2.1 Lifecycle
- Prompts live in version control, are templated with typed inputs, and
  are reviewed in pull requests. A prompt edited in a console is a
  production change with no diff, no review and no rollback.
- A registry resolves prompts by version at runtime, so production can
  answer "which one is live" and a rollback is a version change rather
  than a redeploy.
- Every prompt change ships an eval diff (§3.6). "It reads better" is not
  evidence.

### 2.2 Structure
- System prompt: role, task, constraints, output schema, examples — in
  that order.
- **Assume the system prompt is public** (OWASP LLM07). Nothing in it is a
  secret and nothing in it is a security control. If knowing the prompt
  breaks your product, the control is in the wrong place.
- **Never concatenate user input into instructions.** User content goes in
  a delimited, labelled slot. This does not prevent injection — nothing in
  the prompt does (§6) — but it prevents the model following ordinary
  input that merely looks like an instruction.
- Few-shot examples are data: versioned, evaluated, and retrieved
  dynamically when the task space is wide enough that a fixed set
  misrepresents it.

### 2.3 Structured outputs
- Request a schema and use constrained decoding where the provider offers
  it. Parsing prose is a bug you have scheduled for later.
- **Validate the result anyway.** Schema adherence is not semantic
  correctness: a well-formed object can still be wrong, and the schema
  cannot tell you that the extracted date is the invoice date rather than
  the due date.
- Tool definitions are an interface, and the description is its
  documentation — written for the model with the care a docstring gets.
  Small, typed, one job each. A tool with six optional parameters is three
  tools wearing a coat.

### 2.4 Caching-friendly layout
- Provider prompt caching is **prefix matching**: the cached portion is
  the longest identical prefix, so any byte that changes early invalidates
  everything after it. Typical render order is tools, then system, then
  messages.
- Put the stable material first — system prompt, tool definitions,
  examples — and the variable material last. A timestamp or a request ID
  near the top costs you the entire cache.
- Verify with the provider's cache-hit telemetry rather than by
  assumption. A hit rate of zero across repeated similar requests means
  something upstream is varying, and it is usually a serialisation order
  or an injected clock.

### 2.5 Multi-turn state
A conversation is not a request. History accumulates, and everything in
§2.4 stops holding the moment you edit what you already sent.

- **Sent history is append-only.** Editing an earlier turn changes the
  prefix, which invalidates the cache from that point (§2.4) — and some
  providers now reject a modified history outright rather than silently
  recomputing it. Append; never rewrite.
- Compact by **summarising the oldest turns into a new message**, not by
  deleting or rewriting them in place. The summary is a model call: it
  gets a prompt, a version, and an eval like any other (§3).
- Keep the compaction boundary explicit in the transcript, so a debugger
  can see what the model was actually shown rather than inferring it.
- A conversation needs a ceiling — turns or tokens — and a product
  decision for reaching it. "It gets slower and then it breaks" is not a
  design.
- Anything retrieved or returned mid-conversation is untrusted input on
  every turn, not just the one it arrived on (§6).

**When not to**: a prompt-tuning loop on a question an eval would settle
in an afternoon. Tuning without measurement is how a prompt acquires
twelve superstitions and no accuracy.

**How it goes wrong**: a request ID rendered into the system preamble
for traceability, invalidating the cached prefix on every call — the bill
triples and nothing else changes, so nobody connects the two for a
month.

#### Audit Benchmarks
- Versioning: 100% of production prompts resolved from a registry by
  version. Enforcer: registry, with the resolution under test.
- Inline prompts: zero prompt strings inline in application code.
  Enforcer: lint rule.
- Review: every prompt change ships an eval diff. Enforcer: CI eval job.
- Outputs: 100% of model responses validated against a schema before use.
  Enforcer: lint rule banning unvalidated response access.
- Caching: the shared prefix is byte-stable across requests; cache hit
  rate tracked per feature and alerted when it falls. Enforcer: metrics.
- History: 100% of multi-turn features enforce a turn or token ceiling and
  compact rather than edit sent turns. Enforcer: config test.

---
## 3. Evals

The unit of work. A feature without an eval is a hypothesis you have
deployed to users.

### 3.1 The kinds, and what each buys

| Kind | Catches | Costs |
|---|---|---|
| Unit evals | schema breaks, format regressions, refusals | cheap, deterministic, narrow |
| Golden sets | accuracy regressions on known cases | human labelling, and they age |
| LLM-as-judge | subjective quality at scale | judge drift, and calibration work |
| Human review | everything the others miss | slow, expensive, irreplaceable |
| Online A/B | real behaviour under real load | needs traffic, and a rollback plan |

Use the cheapest kind that can catch the failure you actually fear.
Escalate only where it cannot.

### 3.2 Metrics by task
- Classification: accuracy, precision and recall per class — a single
  accuracy number hides the class that matters.
- Extraction: exact match on the field, plus schema validity.
- RAG: faithfulness (is the answer supported by the retrieved text) and
  answer relevance, evaluated separately from retrieval quality (§4.5).
- Agents: task success rate; **tool-call validity rate** — the share of
  emitted calls naming a real tool with schema-valid arguments; and
  **unsafe-action rate**, a separate number with a hard target of zero
  (§5.5).
- Safety: injection resistance, and false-refusal rate — a model that
  refuses everything scores perfectly on the first and ruins the product.

Name the metric per feature in its spec. "Better" is not a metric.

### 3.3 Judges
- An LLM judge is legitimate and often the only affordable option at
  scale. It is also a model, with all of §1 applying to it.
- **Calibrate against human labels** on a held-out set and record the
  agreement. Re-calibrate whenever the judge model changes — a judge you
  have not calibrated is measuring its agreement with itself.
- Prefer pairwise comparison over absolute scoring for subjective work.
  Models are considerably better at "which of these two" than at "rate
  this 1 to 10", and the pairwise result is stable across runs.
- The judge must not be the model under test. It will prefer its own
  output, and you will ship that preference.

### 3.4 Data
- Eval sets are versioned artifacts, stratified by difficulty and by
  known failure mode, and they include adversarial and injection cases
  from the start (§6.5).
- Guard against contamination: an example that also appears in the prompt
  is not a test, it is a lookup.
- Stratify by language wherever the product is multilingual. Quality is
  not uniform across languages, and an English-only golden set certifies a
  product your users are not using.
- Refresh when the product changes. An eval set that has not changed in a
  year is measuring a product that no longer exists.

### 3.5 Rigour
- Report **n and a confidence interval**. Do not ship on twenty examples:
  the difference you are excited about is inside the noise.
- Run at temperature zero for determinism *and* at production settings for
  realism. They answer different questions and you need both answers.
- A regression smaller than the confidence interval is not a regression.
  Say so, rather than chasing it.

### 3.6 Evals in CI
- Regression evals **block merge** past a per-feature threshold, and run
  on the same trigger list as tests: any change to a prompt, a model, a
  retrieval component, or a guardrail.
- Production is an eval too: sample live traffic, judge it, and alert on
  drift. This is the only thing that catches a provider changing behaviour
  under an identifier you have pinned (§8.3).
- Tooling worth naming, all actively maintained as of 2026-09: `promptfoo`
  for matrix comparison across prompts and models, `inspect` (UK AI
  Security Institute) for agent and safety evaluation, `deepeval` for
  pytest-style regression, `ragas` for retrieval-specific metrics. Hosted
  platforms are an option, not a requirement.

**When not to**: an LLM judge where a deterministic oracle exists. If you
can assert it, assert it — a judge costs money and introduces variance to
measure something `==` already knows.

**How it goes wrong**: a golden set of forty examples, written by the
engineer who wrote the prompt, all passing, none representative — and a
quality collapse nobody can see because the dashboard is green.

#### Audit Benchmarks
- Coverage: every model-backed feature has a golden set of >= 200 items
  (floor); stratified by difficulty with adversarial cases documented
  (elite). Enforcer: eval registry.
- Gate: regressions past the per-feature threshold block merge; 100% of
  prompt, model, retrieval and guardrail changes run evals. Enforcer: CI.
- Judges: every LLM judge has an agreement score against human labels
  >= 0.8, re-measured on judge-model change and stating the metric used
  (floor). Enforcer: calibration job.
- Drift: production traffic sampled and judged daily; alert on a drop past
  threshold. Enforcer: scheduled job + alert rule.
- Rigour: every eval report states n and a confidence interval. Enforcer:
  eval report template + review.

---
## 4. Retrieval

### 4.1 When
Retrieval earns its complexity when facts change, when the corpus exceeds
the context window, when answers must cite a source, or when the material
must never have been in training data. It does not earn it for a corpus of
twelve pages that changes twice a year — put those in the prompt.

### 4.2 Chunking
- Chunk on document structure — sections, tables, code blocks — not on a
  token count. A chunk that ends mid-table retrieves as nonsense.
- Overlap adjacent chunks so a fact spanning a boundary survives.
- **The retrieval unit is what you want to cite.** Work backwards from the
  citation the user should see.

### 4.3 Embeddings
- The embedding model is a pinned dependency exactly as §1 describes, with
  one extra consequence: **changing it means re-indexing the entire
  corpus**. Budget that before you choose, not after.
- Dimension and version are recorded alongside the index, because an index
  whose provenance is unknown has to be rebuilt to be trusted.

### 4.4 Hybrid retrieval
- Lexical (BM25) and vector search together, then a reranker over the
  merged set. This is the default, not an optimisation.
- Pure vector search misses exact identifiers — order numbers, error
  codes, surnames — because they embed as unremarkable. Pure lexical
  misses paraphrase. Each covers the other's blind spot.
- A reranker over a wide, cheap candidate set beats a narrow, expensive
  first-stage retrieval almost every time.

### 4.5 Evaluating retrieval
- **Evaluate the retriever separately from the generator.** recall@k, MRR
  or nDCG for retrieval; faithfulness and relevance for the answer.
- The most common wasted week in this work is tuning a prompt to fix a
  retrieval failure. If the passage was never retrieved, no wording
  repairs it.
- Citations on every factual answer, resolvable to the chunk that
  supported it. An uncitable claim is an unverifiable one.

### 4.6 Access control
- **Filter by the caller's permissions before ranking, never after
  generation.** The model must never see a document the user cannot.
  Post-hoc filtering leaks through summaries, and a summary of a
  confidential document is a confidential document.
- Row-level security on the store, or a permission filter in the query.
  Test it: assert that a user cannot retrieve a document they cannot read
  (`application-security` §3).
- Retrieved documents are an injection vector, and a poisoned corpus is a
  *persistent* attack — it fires on every query that retrieves it (§6).

### 4.7 Operations
- Freshness: invalidate on source change, and track staleness as a metric.
  A confidently cited stale answer is worse than no answer.
- Start with the vector store you already operate — `pgvector` in the
  database you already back up, secure and monitor. A dedicated store is
  earned by measured scale or latency (`backend-engineering` §4.3).
- Agentic retrieval (the model decides what to fetch) and graph-based
  retrieval are real options with real costs — more calls, more latency,
  harder evaluation. Neither is a default.

**When not to**: RAG to fix a format problem, which is a prompting or
fine-tuning question; or RAG over a corpus that fits in context and does
not change.

**How it goes wrong**: an embedding model swapped for a better one
without re-indexing, so old vectors and new queries share a space they no
longer agree on. Retrieval quietly degrades to noise and every downstream
eval blames the generator.

#### Audit Benchmarks
- Retrieval quality: recall@k measured on a labelled query set, k and the
  floor stated per feature, evaluated separately from generation.
  Enforcer: eval job.
- Grounding: citations on 100% of factual answers; faithfulness at or
  above the per-feature threshold. Enforcer: eval job.
- Access: 100% of retrieval paths filter by caller permissions before
  ranking, with a test asserting a user cannot retrieve a document they
  cannot read. Enforcer: CI test.
- Index integrity: embedding model and version pinned and recorded with
  the index; re-index rehearsed before any embedding change. Enforcer:
  config lint + runbook.
- Freshness: staleness tracked per source against a stated maximum age
  per corpus; invalidation within one hour of a source change. Enforcer:
  metrics + alert rule.

---
## 5. Agents

### 5.1 Should this be an agent at all
Four questions, and a "no" to any one of them means stay simpler:

- **Complexity** — is the task genuinely multi-step and hard to specify in
  advance? "Turn this brief into a pull request" qualifies; "extract the
  title from this PDF" does not.
- **Value** — does the outcome justify the cost and the latency?
- **Viability** — is the model actually good at this task? Check with an
  eval, not a demo.
- **Cost of error** — can mistakes be caught and undone? Tests, review,
  rollback.

The tiers below an agent are a single call and a **workflow** — a
predefined code path that happens to call a model at some steps. Most
things people build as agents are workflows, and workflows are cheaper,
faster, testable and debuggable. Reach for an agent when the *sequence*
genuinely cannot be written down in advance.

### 5.2 Patterns

| Pattern | Use when | Cost |
|---|---|---|
| Single tool-loop | one clear job, a handful of tools | lowest; the default |
| Router | distinct task classes with different handling | one extra call per request |
| Planner–executor | the plan is worth inspecting before it runs | latency, and plan quality becomes a second thing to evaluate |
| Multi-agent | genuinely parallel sub-tasks over separate contexts | high; hardest to debug |

Multi-agent is the exception, not the aspiration. Most multi-agent systems
are one agent with worse observability and a larger bill. The successful
implementations are consistently the simple composable ones (Anthropic,
"Building effective agents", 2024).

Prefer an explicit **state machine** over free-running: the model chooses
the next step from a bounded set, and the set is code you can read.

### 5.3 The safety contract
Non-negotiable before an agent touches anything real. Each line is testable
and should have a test.

- **Least privilege.** The narrowest capability that does the job. Never a
  general shell, never an admin credential, never a database URL that can
  write. Scope credentials per tool, not per agent.
- **Human approval for irreversible actions** — spending money, sending
  messages, deleting data, changing permissions. The approval must be a
  real decision: enough context to judge, and not so frequent that it
  becomes a reflex.
- **Sandbox** the execution environment, with network egress on an
  allowlist. An agent that can reach the internet can exfiltrate anything
  it can read.
- **Ceilings per run**: tokens, wall-clock, steps, and cost. An agent
  without a ceiling is an unbounded bill with a retry loop attached.
- **Audit every tool call** with arguments and results. When something
  goes wrong this log is the only account of what happened.

### 5.4 Tools and MCP
- Small, typed, one job each, idempotent where possible. The description
  is the interface documentation and the model reads it more carefully
  than your colleagues read docstrings.
- A tool that can do two things will eventually be asked to do the wrong
  one. Split it.
- **MCP** standardises tool integration across servers, and inherits
  three threats worth naming: **tool poisoning** (a malicious server
  describes its tool in a way that manipulates the model), **confused
  deputy** (the agent acts on a third party's instruction using the
  user's authority), and **server trust** (you are executing someone
  else's code path). Mitigations: allowlist servers, pin versions, review
  tool descriptions as code, and scope credentials per server.
- Tool *results* are untrusted input. A tool that returns attacker-
  controlled text is an injection vector with extra steps.

### 5.5 Failure modes
Each needs the bound that stops it, not a prompt asking it not to happen.

| Failure | Bound |
|---|---|
| Loops | step ceiling, with an alert on runs that hit it |
| Tool hallucination (calling what does not exist) | strict schemas; reject and return an error the model can read |
| Goal drift | bounded state machine; re-anchor on the original task |
| Runaway cost | per-run token and cost ceiling |
| Silent partial completion | explicit success criteria the run is judged against |

### 5.6 Testing
- Scenario evals with a success rate per agent, and **unsafe-action rate
  with a target of zero** — not "low".
- Chaos for agents: a tool that fails, a tool that times out, a tool that
  returns something plausible and wrong. The recovery path is the thing
  under test.
- Memory, where an agent has it, is another injection surface and another
  retention obligation (§9). Treat stored memory as untrusted on read.

**When not to**: an agent where a function, a workflow, or a three-step
script would do. That is most of the time, and choosing it is not a
failure of ambition.

**How it goes wrong**: an agent with a payment tool and a confirmation
step the model itself answers.

#### Audit Benchmarks
- Contract: every agent's tools are least-privilege, asserted by a config
  test. Enforcer: CI.
- Human gates: every irreversible action an agent can reach has a human
  gate, asserted by a config test. Enforcer: CI.
- Sandbox: every agent runs in a sandbox with an egress allowlist,
  asserted by a config test. Enforcer: CI.
- Audit: 100% of tool calls logged with arguments and results. Enforcer:
  log-scan test.
- Safety: unsafe-action rate is zero on the scenario eval set; task
  success rate at or above the per-agent threshold. Enforcer: eval job.
- Servers: 100% of MCP servers on an allowlist and version-pinned.
  Enforcer: config lint.
- Tool descriptions: every tool description reviewed on change, by a human
  who can refuse it. A description is a prompt the model obeys. Enforcer:
  CODEOWNERS on the tool definitions.
- Containment: every agent runs under all four ceilings — tokens, steps,
  wall-clock, cost — with runs that hit one alerting rather than retrying.
  Enforcer: metrics + alert rule.

---
## 6. Guardrails

### 6.1 What they are for
Guardrails are defence in depth. **They are not the control.** The control
is capability scope (§5.3) and output mediation (§6.3). A guardrail
reduces how often something bad reaches the model or the user; it does not
make the bad thing impossible, and designing as though it does is how a
94%-recall classifier ends up as the only thing between a model and a
payment API.

### 6.2 Input side
- PII redaction before send (§9.2).
- Topic and intent classifiers where the product has a defined scope.
- Injection detection — useful, and **imperfect by construction**. Say so
  out loud in the design review, because the number people remember is the
  recall, not the miss rate.
- Allowlists over blocklists, everywhere the domain permits one.
- **Every modality reaching the model is an input surface.** Instructions
  ride in images, in a PDF's text layer, and in an audio transcript as
  readily as in a chat box, and a scanner that only reads the text field
  will not see them. The mitigation is the same as for text: scope what
  the model may do (§5.3), not better detection.

### 6.3 Output side
- Schema validation before use (§2.3).
- Content moderation where the output reaches a person.
- PII and secret leak detection before the output leaves.
- Groundedness checks for retrieval answers (§4.5).
- A check that no tool call was emitted where none was permitted.

### 6.4 Mapping
The OWASP LLM Top 10 (2025) is the threat taxonomy (§11). This file owns
the list and places each control:

| Threat | Where the control lives |
|---|---|
| LLM01 Prompt injection | §5.3 capability scope; §6.3 output mediation |
| LLM02 Sensitive disclosure | §9 governance; §6.3 leak detection |
| LLM03 Supply chain | §1.2 pinning; `application-security` §4.1 |
| LLM04 Data & model poisoning | §4.6 corpus access; §1.2 pinning and provenance |
| LLM05 Improper output handling | §2.3 validation; §6.3 |
| LLM06 Excessive agency | §5.3 the whole contract |
| LLM07 System prompt leakage | §2.2 assume it is public |
| LLM08 Vector & embedding weaknesses | §4.6 access control at retrieval |
| LLM09 Misinformation | §4.5 grounding and citations; §3 evals |
| LLM10 Unbounded consumption | §5.3 ceilings; §7.2 budgets |

### 6.5 Red teaming and refusals
- Red team on a cadence, and **land every finding in the eval set** so the
  same weakness cannot return unnoticed. A finding that only becomes a
  ticket will regress.
- A refusal is a product state with a UX, not an error to swallow. Log it,
  measure the rate, and treat a rise in **false** refusals as a regression
  — an over-refusing feature fails users while scoring well on safety.

**When not to**: a topic classifier on a surface with no defined scope.
It will refuse the long tail of legitimate questions, and false refusals
cost users while scoring perfectly on the metric that justified it.

**How it goes wrong**: an injection scanner reading the text field of an
upload while the instruction rides in the image beside it — every
modality is an input surface, and the scanner covered one.

#### Audit Benchmarks
- Layering: every privileged action has a capability-scope control that
  does not depend on any classifier. Enforcer: architecture review +
  config test.
- Injection: adversarial cases in every eval set; resistance rate tracked
  per feature and regressions block merge. Enforcer: eval job.
- Output: 100% of outputs pass schema and leak checks before reaching a
  user or a tool. Enforcer: middleware test.
- Refusals: false-refusal rate measured per release; a rise blocks merge.
  Enforcer: eval job.
- Red team: quarterly (floor); continuous automated (elite); 100% of
  findings in the eval set within one sprint. Enforcer: calendar + eval
  diff.

---
## 7. Cost and latency

### 7.1 Accounting
- Tokens and spend as **metrics**, per feature and per tenant, emitted
  like any other telemetry (§8.4). An invoice is not observability; by the
  time it arrives the money is gone and the cause is a month old.
- Track **cost per successful outcome**, not cost per request. It is the
  number that survives a model swap: a cheaper model that needs three
  attempts is not cheaper, and only this metric shows it.
- Attribute to a tenant. Without it you cannot price the product, and you
  cannot find the one customer whose usage pattern is the whole overage.

### 7.2 Budgets
- Every feature has a budget and a named owner. Alert at 80% of budget,
  page at 120% (`backend-engineering` §14).
- Ceilings are enforced in code, not in policy — per-run limits on tokens,
  steps and cost (§5.3). A budget with no enforcement is a forecast.

### 7.3 The levers, cheapest first
1. **Caching.** Prefix caching is free money on any workload with a stable
   preamble (§2.4). Do this before anything else.
2. **Input hygiene.** Send what the task needs. Retrieval beats stuffing;
   a trimmed context is cheaper *and* usually more accurate (§1.4).
   Measure input size before sending and enforce a ceiling: when it is
   exceeded, *choose* what to drop. Letting a provider or a library
   truncate for you removes the middle of the document — which is where
   §1.4 says the model was already weakest — and returns a confident
   answer about material it never saw.
3. **Output caps.** Cap generation length. Verbosity is billed.
4. **Batch.** Asynchronous work goes through batch endpoints where the
   provider offers them — typically around half price, though verify per
   provider — in exchange for latency you were not using.
5. **Routing.** Cheap tier first, escalate on a confidence signal or a
   failed validation. The eval decides which tier per task class (§1.1).
6. **Model choice.** Last, and measure it: judge on cost per successful
   outcome, and note that a cascade forfeits cache reuse across models,
   because caches are model-scoped.

### 7.4 Latency
- Stream anything a person waits on. Perceived latency is the product;
  total latency is the bill.
- Semantic caching — returning a cached answer to a *similar* question —
  needs a measured false-hit rate before it goes near a user, because
  "similar" is a judgement and a wrong hit is a confident wrong answer.
- Provider rate limits are a capacity input (`backend-engineering` §5.3):
  queue and shed rather than retry into a 429.

**When not to**: optimising the cost of a feature that has not proved its
value. Prove it, then make it cheap.

**How it goes wrong**: a retry loop against a frontier model with no
ceiling, discovered by the finance team rather than by an alert.

#### Audit Benchmarks
- Accounting: tokens and cost emitted as metrics per feature and per
  tenant; cost per successful outcome tracked. Enforcer: telemetry +
  dashboard.
- Budgets: every feature has a cost budget and a named owner. Enforcer:
  budget registry reviewed per release.
- Budget alerts: every budget alerts at 80% of it. Enforcer: alert rules.
- Budget pages: every budget pages a human at 120% of it. Enforcer: alert
  rules.
- Caching: prefix cache hit rate tracked per feature; a fall below the
  per-feature floor alerts. Enforcer: metrics.
- Routing: every task class has a tier decided by a stored eval run.
  Enforcer: ADR + eval artifact.
- Truncation: zero silent truncation — every over-limit input is rejected
  or reduced by a named strategy. Enforcer: client wrapper under test.

---
## 8. Reliability and operations

### 8.1 The controls you already have
`backend-engineering` §5 applies unchanged — timeouts on every call,
retries only on idempotent operations with backoff and jitter and a
budget, circuit breakers, bulkheads. What is specific to model calls:

- Rate-limit and overload responses are routine, not exceptional. Handle
  them as flow control, with backoff, not as errors to surface.
- Generation latency has a long tail. Set the timeout from the
  distribution you measured, and distinguish time-to-first-token from
  total time when streaming.
- A stalled stream is a failure mode of its own: a stream that has stopped
  producing tokens but has not closed will hang until something times it
  out.

### 8.2 Fallback
- A fallback chain needs **eval parity** (§1.2) and a schema-compatible
  interface. Keep the abstraction thin — an adapter, not a framework — so
  that swapping providers does not become its own migration project.
- Do not build a multi-provider abstraction before the second provider has
  been evaluated. You will abstract the wrong things.

### 8.3 Silent regression
The failure nothing else catches: **a provider changes behaviour under an
identifier you have pinned.** No deploy, no error, no alert — output
quality simply moves.

- Detect it with a canary eval over sampled production traffic, run daily
  and alerted on drift (§3.6).
- The model-regression runbook's first two steps are "roll back to the
  previous prompt version" and "switch to the evaluated fallback". Write
  them down before you need them at 03:00.

### 8.4 Observability
- Trace every model call: model identifier and version, token counts,
  latency, cost, and the prompt and response under redaction (§9.2).
  Correlate with the request trace (`backend-engineering` §10).
- The **OpenTelemetry GenAI semantic conventions** are the standard to
  follow, with a caveat to record: as of 2026-09 they remain in
  *Development* status, they have no stable release, and in mid-2026 they
  moved out of the main semantic-conventions repository into a dedicated
  one. Attribute names can still change. Follow them anyway — the
  alternative is a bespoke schema nobody else can read — but pin the
  version you emit and expect a migration.

**When not to**: a provider-abstraction layer, a semantic cache, and a
router, all before the first feature has shipped.

**How it goes wrong**: a provider's quiet quality regression, invisible
for two weeks because the only monitoring was uptime, and uptime was
perfect throughout.

#### Audit Benchmarks
- Controls: 100% of model calls carry an explicit timeout, a breaker, and
  a bounded retry policy. Enforcer: client factory under test.
- Fallback: exercised monthly and passes eval parity. Enforcer: game day +
  eval job.
- Drift: canary eval over sampled production traffic runs daily; a drop
  past threshold alerts. Enforcer: scheduled job + alert rule.
- Traces: 100% of calls traced with model version, tokens, latency, cost
  and redacted content. Enforcer: integration test.
- Runbook: a model-regression runbook exists and is drilled at least
  annually. Enforcer: calendar + incident review.

---
## 9. Data governance

### 9.1 What may leave
- The classification table in `application-security` §5 decides it.
  **Restricted data does not reach a third-party model without a DPA and
  zero-retention terms.** Confidential requires a DPA. Public and internal
  follow the vendor gate like any other processor.
- Training opt-out confirmed **in writing**, not inferred from a settings
  page that can change.
- Data residency stated per provider and per feature, because "the API"
  may be several regions with different answers.

### 9.2 Redaction and logs
- Redact before send. Re-identify on your side afterwards if the workflow
  needs it — the provider never needs the identifier.
- **Prompts and responses are logs.** They carry personal data, they need
  a retention policy, and an erasure request covers them. Teams routinely
  build careful PII handling in the database and then log the same data
  verbatim in a prompt trace.
- Consent where a user's content is processed by a third party.

### 9.3 Regulation
- The **EU AI Act** is in force with obligations phasing in. As of
  2026-09: general-purpose AI model obligations applied from 2 August
  2025; transparency obligations under Article 50 apply from 2 August
  2026; and the high-risk obligations were **deferred** — Annex III
  high-risk systems to 2 December 2027 and Annex I to 2 August 2028.
  Dates have moved once and may move again; check before relying on one.
- Engineering's part is classification, documentation, logging and human
  oversight — the same artifacts this file already requires. Legal
  interpretation is not engineering's to do, and this file does not
  attempt it.
- **NIST AI Risk Management Framework** (2023) with its Generative AI
  profile (2024) is the voluntary framework worth mapping to if you need
  one; it aligns cleanly with the controls here.

**When not to**: relying on a zero-retention endpoint as the only control
for restricted data. The payload still crossed your boundary, and the
control you need is not sending it.

**How it goes wrong**: a support transcript containing a card number, sent
to a provider under default terms, now in a log you do not control and
cannot delete.

#### Audit Benchmarks
- Terms: a DPA or zero-retention terms in place before any customer data
  reaches a provider; training opt-out confirmed in writing. Enforcer:
  vendor gate.
- Redaction: 100% of outbound prompts pass a redaction step, with a test
  asserting a seeded PII string never leaves. Enforcer: CI test.
- Logs: 100% of prompt and response logs carry a classification and a
  retention period, and are covered by erasure; deletion runs on schedule.
  Enforcer: retention job + annual DSAR drill.
- Residency: data residency documented per provider and per feature.
  Enforcer: vendor inventory review.

---
## 10. AI-assisted engineering

Deepens `backend-engineering` §14's rule that AI-generated code is a
third-party contribution.

- **Coding agents run with least privilege**: no production credentials,
  sandboxed, egress allowlisted. The blast radius of a confused coding
  agent is the credentials you handed it.
- Their output is a **third-party contribution**: same gates, same review,
  same accountability. The author is the human who merged it, and that is
  not a formality — it is who answers for the regression.
- Review for the failure modes this code actually has, which are not the
  ones human code has: plausible-but-wrong API usage, tests that assert
  the bug, silent scope creep beyond the request, and secrets pasted in
  from context.
- **Agent-readable repositories.** The repository-level instruction file
  an agent reads first — whatever the harness calls it — is part of the
  codebase and is reviewed like it. The gates in `backend-engineering` §9
  are the contract an agent is held to, and they work better than
  instructions because they cannot be talked out of.
- **Provenance**: mark agent-authored commits so a regression can be
  traced to the process that produced it, not just the person who pressed
  merge.
- An agent needs an oracle. On a repository with a passing test suite and
  real gates it can check its own work; without one, neither it nor you
  can tell whether the change is correct.

**When not to**: a provenance marker as the accountability story. It
says which process produced a commit, not that anyone read it; the human
who merged it is still the author, and a marker is how you find the
regression, not who answers for it.

**How it goes wrong**: an agent handed a production database URL in its
environment and asked to "clean up the migrations".

#### Audit Benchmarks
- Privilege: zero production credentials in any coding-agent environment.
  Enforcer: environment config lint.
- Egress: every coding-agent environment has an egress allowlist.
  Enforcer: environment config lint.
- Review: 100% of agent-authored pull requests reviewed by a human and
  passing the same gates as human ones. Enforcer: branch protection.
- Provenance: 100% of agent-authored commits carry a marker and are
  queryable. Enforcer: commit trailer + `commitlint` rule.
- Oracle: agents operate only on repositories with a passing suite and the
  gates in `backend-engineering` §9. Enforcer: policy + CI.

---
## 11. Canon

Sources behind the rules above, each with what it settles.

- OWASP **Top 10 for LLM Applications** (2025) — the threat taxonomy §6
  maps controls onto. Awareness, not an audit.
- Anthropic, "Building effective agents" (2024) — workflows versus agents,
  and the case that simple composable patterns beat frameworks. The
  argument behind §5.1 and §5.2.
- Liu et al., "Lost in the Middle: How Language Models Use Long Contexts"
  (2023) — performance is highest when the relevant material is at the
  start or end of the input, and degrades in the middle. The reason §1.4
  treats long context as a tool rather than a substitute for retrieval.
- Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive
  NLP Tasks" (2020) — the original formulation §4 builds on.
- Willison on prompt injection (2022 onwards) — the sustained argument
  that no prompt defends itself, which is the thesis of §0 and §6.1.
- **NIST AI Risk Management Framework** (2023) and its Generative AI
  profile (2024) — the voluntary framework to map to when one is needed.
- The **EU AI Act** — the regulation whose dates §9.3 tracks. Read the
  official timeline rather than a summary; it has already been amended.
- The **Model Context Protocol** specification — the tool-integration
  standard and its revision history (§5.4).
- `inspect` (UK AI Security Institute) documentation — the reference
  implementation of agent and safety evaluation described in §3.
