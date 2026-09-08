---
id: backend-engineering
title: Backend Engineering Skill Set
version: 1.5.0
status: active
owner: CLARENT
audience: ALLOGENES
domain: [backend, python, architecture, api, data, security, testing,
         observability, devops, ai]
activation:
  triggers:
    - "designing, building, or reviewing a backend service or API"
    - "planning a wave or auditing a Python codebase at wave end"
    - "deciding on architecture, data model, auth, or a critical dependency"
    - "responding to a security finding or writing an incident postmortem"
  scope: "Python-first backend engineering, professional to elite level"
  excludes: "frontend implementation, notebooks, model training"
extends: []
requires: []
see_also: [llm-engineering, application-security, frontend-engineering,
           api-design]
manual_scores:
  density: 12
  editions: 5
  scored_by: Fable 5.1
  scored_at: 2026-09-08
  defended_in: reports/audit-v5.md
updated: 2026-09-08
review_by: 2027-03-08
---

# Backend Engineering Skill Set

Python-first. Operated in waves: analyze -> iterate -> audit against the
benchmarks at the end of each domain -> audit the whole as a system.

Every domain section ends with **Audit Benchmarks**. Those are the
contract; the body text above them is the reasoning. §0 defines how to
read one.

---
## 0. Operating Doctrine

- Every domain below ends with an **Audit Benchmarks** list. Each bullet
  states a threshold and names its enforcer, at two levels: **floor** is
  what a professional ships unaided, **elite** is what the top of the
  field holds itself to. At wave end, measure the work against those
  standards, not against feelings.
- **Defaults are binding.** Every rule here is a default: follow it
  without discussion, deviate only with an ADR. Classify the deviation
  first — a two-way door is decided fast and noted; a one-way door needs
  the ADR and a review before merge.
- **Where a deviation is recorded.** An ADR file is the usual home, but
  what the rule requires is that the deviation is *written down, where a
  reviewer will find it, with the reason and a name*. A repository's own
  law file — `CLAUDE.md`, `AGENTS.md`, a `CONTRIBUTING` section — counts,
  and so does a reasoned comment beside the config it modifies, which is
  where a reviewer of that config will actually look. What does not count
  is a bare suppression, or a reason that exists only in a commit message
  or someone's memory.
- **ADR triggers.** Write one for: a new external integration; any
  authn/authz change; any data-model change; a new dependency in the
  critical path; any change to a trust boundary; any deviation from a
  default in this file.
- **Reading rule.** Benchmarks are the contract; body text is the
  reasoning. When the two disagree, the benchmark is wrong — fix it, do
  not reinterpret it.
- At campaign end, audit the system as a whole: quality attributes interact
  (security vs. performance vs. maintainability). Component wins that break
  the system are losses.
- Never execute anything without express permission. Explain risk and
  reasoning first.

---
## 1. Engineering Fundamentals

### 1.1 Design principles
- SOLID — with the *why*: SRP (one reason to change), OCP (open for
  extension), LSP (substitutability), ISP (small interfaces), DIP (depend
  on abstractions, inject dependencies).
- DRY after the third duplication (the rule of three), not the first.
  Deduplicating too early couples code that only looked alike, and the
  cost lands later as a shared abstraction with two reasons to change.
- YAGNI, KISS, Law of Demeter, composition over inheritance.
- **Parse, don't validate** (King, 2019): make illegal states
  unrepresentable. A validated `str` is still a `str`; an `EmailAddress`
  cannot be anything else. Push the check to the boundary and carry the
  proof in the type.
- Functional core, imperative shell: pure decisions in the middle, I/O at
  the edges. The core is then testable without mocks.
- Fail fast, fail loud: validate at boundaries; never silently swallow
  exceptions. Exceptions for the exceptional; typed results only where
  failure is part of the domain — pay: the failure type goes viral through
  every signature above it.

### 1.2 Design patterns (GoF essentials)
- Know the GoF vocabulary and know when not to reach for it: patterns
  are vocabulary, not goals.
- Anti-patterns worth naming so they can be rejected by name: anemic
  domain model (data classes with the logic elsewhere), God object,
  service locator (dependency injection's shadow, untestable).
- On repositories: a SQLAlchemy `Session` already *is* a unit of work, and
  a `select()` already abstracts SQL. Write a repository when you need a
  seam — to swap a store, or to keep ORM types out of the domain — never
  because the pattern list said to have one.

### 1.3 Architecture styles
- **Clean Architecture / Hexagonal (ports & adapters) / Onion**: domain in
  the center, dependencies point inward. The dependency rule is the whole
  game.
- **Modular monolith** first. Split a bounded context out only when at
  least two of three hold: it must deploy independently, it owns its data,
  and it maps to one team (Conway). And only when the monolith's build,
  deploy or scaling pain is *measured* — "it feels slow" is not a metric.
- Strangler fig for migrations: route by route, never a rewrite. The
  rewrite that ships is the one nobody attempted in one step.
- Event-driven: event sourcing, sagas, the transactional outbox, CQRS
  when reads and writes genuinely diverge. Mechanics in §5.
- Event schemas are contracts: version them, register them, and review a
  change the way you review an API change (`api-design` §7).
- Layered vs. vertical slice: vertical slices align with feature teams.
- Serverless when the load is bursty, stateless and cold-start tolerant.
  Pay: lock-in and local-development friction.

### 1.4 Domain-Driven Design
- Event storming for discovery. An aggregate is a **consistency
  boundary**: one transaction per aggregate, never per entity. Consistency
  *across* aggregates is eventual, carried by domain events.
- Value objects are `frozen=True`. Domain events are named in the past
  tense — `OrderPlaced`, not `PlaceOrder`.
- An anti-corruption layer at every external boundary: their model does
  not get to leak into yours.
- The domain model is not the data model. When they are forced to be the
  same thing, one of them is wrong.
- DDD is for complex domains. CRUD apps do not need it — do not cargo-cult.

### 1.5 Trade-off literacy
- Every architecture decision is a trade-off; write it down (ADR).
- **Architectural fitness functions**: an architecture rule that CI cannot
  check is a diagram, not an architecture. The dependency rule becomes
  `import-linter` contracts; the layering becomes a test. This is the
  single highest-leverage thing in this section.
- One-way vs. two-way doors. Spend review time proportionally; most
  decisions are reversible and are being over-discussed.
- PACELC over CAP: CAP describes the partition case, which is rare.
  PACELC also asks what you trade *else*, in normal operation, which is
  the question you actually face every day.
- Quality-attribute scenarios (stimulus → response → measure) are the
  input to SLOs (§10). "Fast" is not a requirement; "p99 < 200ms at 500
  rps" is.
- Boring technology, and innovation tokens (McKinley, 2015): you get about
  three novel things per team. Spend them where novelty is the product.
- A tech-debt register with an interest rate — what the delay costs per
  month. A wishlist without one never gets funded.

**When not to**: a CRUD service with one consumer needs none of DDD, CQRS,
or event sourcing. It needs a clean module and a migration story.

**How it goes wrong**: the "temporary" import from `infrastructure` into
`domain`, added under deadline, which nothing detects — and two years
later the domain cannot be tested without a database.

#### Audit Benchmarks
- Dependency rule: zero violations — `domain` imports nothing from
  `application`, `infrastructure` or `api`; `application` imports nothing
  from `infrastructure` or `api`. Enforcer: an import-contract checker in
  CI (`import-linter`).
- Deviations: every ADR trigger in a merged PR links an ADR; zero PRs
  marked "ADR needed" without one. Enforcer: PR template + CODEOWNERS on
  `docs/adr/`.
- Complexity: cyclomatic <= 10 per function (floor); cognitive complexity
  held low by review (elite). Enforcer: Ruff `C901`, `PLR0912/0913/0915`.
- Abstraction fit: judgement-based, no automated gate. Reviewers ask
  whether a seam has three call sites or a real substitution before it
  earns its place. Enforcer: review checklist.

---
## 2. API Design & the Frontend Contract

The contract lives in `api-design`, which this file requires. It carries
resource shape and status codes, RFC 9457 errors, evolution and
deprecation, idempotency and conditional requests, webhooks and real-time,
the protocol decision, and what the backend owes a browser client.

What holds here, without opening it:

- **Every route is in the spec.** A route that is not is a shadow API, and
  a shadow API is an unauthenticated one waiting to be found. §9 names the
  test that proves it.
- **Evolve, do not version.** Additive changes only; a breaking change
  earns a new major path and a deprecation window, never a silent
  redefinition of a field.
- One error shape across the whole surface, and it is RFC 9457. A client
  that needs two parsers has two bugs waiting.
- Every creating `POST` is idempotent under a client-supplied key. A
  network retry must not produce a second order.
- The browser gets a cookie, never a token (`application-security` §3).

**When not to**: treating this summary as the contract. It is what holds
without opening `api-design`; the shapes, the gates and the per-concern
failure modes are there.

**How it goes wrong**: a team implements from this list alone, ships
without a deprecation story, and learns at the first breaking change that
"evolve, do not version" needed the machinery `api-design` §4 describes.

#### Audit Benchmarks
- Inventory: 100% of routes present in the OpenAPI document; a test
  asserts `routes ⊆ spec`. Enforcer: CI test.
- Breaking changes: zero unreviewed breaks; every break ships
  `Deprecation` + `Sunset` >= 90 days before removal. Enforcer: `oasdiff`
  in CI.
- Coverage: every control in `api-design` has a gate there; zero
  benchmarks in that file marked unenforced without a stated reason.
  Enforcer: `mdshop validate` + review.

---
## 3. Core Python Mastery

### 3.1 Language fundamentals (beyond syntax)
- Data model: dunder methods, protocols (PEP 544), descriptors, metaclasses
  (know them; use them rarely), context managers, iterators/generators,
  decorators with `functools.wraps`.
- Error handling: exceptions as control flow only for exceptional paths;
  `raise ... from` chains; custom exceptions inheriting from a domain base.
- Aware datetimes only. Store UTC, render local; `zoneinfo` is the tz
  source; `datetime.UTC` (3.11+); `utcnow()` is deprecated (3.12). A naive
  datetime is a bug that surfaces in production, not in tests.
- Know what landed and when, so you can use it and so you can read code
  that does: structural pattern matching (3.10); `ExceptionGroup` and
  `except*` (3.11); PEP 695 generics and `type` aliases, `@override`
  (3.12); `TypeIs`, `ReadOnly`, `@deprecated` (3.13); template strings
  (PEP 750) and deferred annotation evaluation (PEP 649/749) (3.14).
- Template strings are the safe path for building SQL, shell and HTML:
  a `t"..."` yields a `Template`, not a `str`, so an interpolation cannot
  reach a sink unescaped by accident.

### 3.2 Typing (non-negotiable at professional level)
- Full type hints on all public code; `pyproject.toml` with the checker in
  strict mode: `strict = true`, `disallow_untyped_defs`,
  `warn_unused_ignores`.
- Checker choice, as of 2026-09: mypy and pyright remain the safe
  defaults. **Pyrefly** reached 1.0 (2026-05) and runs at Meta scale — a
  credible CI checker now. **ty** is still beta with materially lower
  spec conformance: excellent for editor feedback, not yet a gate. Pin
  whichever you choose; a checker upgrade is a breaking change.
- TypedDict, Protocol, `TypeVar`/`Generic`, `Literal`, `Final`, `Self`,
  `Never`, overloads. Prefer `collections.abc` generics.
- `dataclasses` + `frozen=True` for value objects; Pydantic v2 for
  boundary types, always with `extra="forbid"` — that one setting is the
  mass-assignment defence (`application-security` §4), not a style
  preference.
- Runtime validation at the edge, type checking inside. Validate once, at
  the boundary; past it, the type is the proof.

| Need | Reach for |
|---|---|
| Untrusted input at a boundary | Pydantic v2, `extra="forbid"` |
| Internal value object | frozen `dataclass` |
| Structural dict shape, no runtime cost | `TypedDict` |
| Serialization is the measured bottleneck | `msgspec` (pay: smaller ecosystem) |

### 3.3 Async
- `asyncio` mental model: event loop, tasks vs coroutines, `asyncio.gather`
  vs `TaskGroup` (Python 3.11+), timeouts (`asyncio.timeout`),
  cancellation semantics, `run_in_executor` for blocking calls.
- Never block the loop: sync DB drivers/`requests` in async code is a bug.
- Prefer native async drivers: asyncpg, aiosqlite, httpx, redis-py asyncio.
- Concurrency libraries: `anyio` for portability, `uvloop` for throughput.
- `contextvars` carries request-scoped state across `await` — this is how
  a correlation ID survives into every log line (§10) without threading it
  through every signature.
- `asyncio.to_thread` for a blocking call you cannot avoid; a `Semaphore`
  to bound fan-out, because unbounded `gather` over a thousand items is a
  denial-of-service you wrote yourself.
- Cancellation is cooperative: `asyncio.shield` what must not be cut, use
  `aclosing` for async generators, and make cleanup cancellation-safe.
- Async does not make CPU-bound code faster. It makes waiting cheaper.
  Reach for a process pool or a compiled extension instead (§6).

### 3.4 Packaging & tooling (2026 standard)
- `uv` as the default toolchain (or poetry/pip-tools for legacy projects).
- `pyproject.toml` is the single source of truth (PEP 621).
- Version policy: support the two newest stable minors, drop one within six
  months of its successor, pin in `.python-version` and `requires-python`.
  As of 2026-09 that is 3.13 and 3.14; 3.15 lands 2026-10.
- Lockfiles committed; `uv.lock`/`poetry.lock`. Reproducible installs.
  PEP 751 `pylock.toml` (2025) is the interoperable export when another
  tool has to read your lock; `uv.lock` stays the working file.
- `uv python install` manages the interpreter, so the version is a
  property of the project rather than of the laptop.
- CI installs with `uv sync --frozen`: the lockfile is authoritative, and
  a drifted lock fails the build instead of the deploy.
- PEP 735 dependency groups (`dev`, `test`, `lint`) over extras for
  development-only dependencies.
- Publish with trusted publishing (PyPI OIDC) — no long-lived API token in
  CI. Build backend: `hatchling` unless you need otherwise.
- **Dependency cooldown**: `exclude-newer` at seven days or more
  (`application-security` §4.1).
- Layout: `src/app/{api,application,domain,infrastructure,core}` and
  `tests/{unit,integration,e2e}`, as `templates/python/pyproject.toml`
  encodes it — there the layer names are the `import-linter` contract
  rather than a picture of one. `src/` rather than a top-level package, so
  tests run against the *installed* distribution and a packaging mistake
  fails in CI instead of in production.
- Config management: pydantic-settings; env vars, never hardcoded.

### 3.5 Style conventions
- PEP 8 (via Ruff), PEP 20 (Zen of Python) as taste filter.
- Docstrings on public API only, PEP 257 and Google style — linted, not
  hoped for: Ruff `D`.
- Comments explain *why*. The code already says what, and a comment that
  restates it will be the first thing to go stale.
- `from __future__ import annotations` while you support < 3.14; PEP 649
  deferred evaluation makes it redundant once 3.14 is your floor.

**When not to**: `__slots__`, `sys.intern` and lazy imports are §6 work,
after a profile. Metaclasses and descriptors are worth knowing and rarely
worth writing.

**How it goes wrong**: a `requests.get()` three layers below an `async
def`, blocking the event loop for every concurrent request, invisible
until p99 doubles under load and no profile is pointed at the right place.

#### Audit Benchmarks
- Versions: CI matrix over the two newest stable minors (floor); adds the
  free-threaded build (elite). Enforcer: CI matrix.
- Async hygiene: zero blocking calls on async paths. Enforcer: Ruff
  `ASYNC` + `TID251` banning `requests` and `time.sleep` in async packages.
- Datetimes: zero naive datetimes. Enforcer: Ruff `DTZ`.
- Layout: `src/` layout; zero imports resolving from the source tree
   during a test run, so a packaging mistake fails in CI. Enforcer: CI
   (`uv sync`, then test from a clean checkout).

---
## 4. Data & Storage

### 4.1 Relational (SQL) — the default
- PostgreSQL unless there is a reason: the planner, the extension
  ecosystem, row-level security, and `SKIP LOCKED` cover more ground than
  most products will ever need from a second store.
- Modeling: normalization to 3NF by default, denormalize deliberately
  (read patterns, reporting).
- Keys: `GENERATED ALWAYS AS IDENTITY`, or UUIDv7 (RFC 9562, 2024) when
  the key must be generated client-side. Never `SERIAL`. Never UUIDv4 as a
  primary key on a large table: Postgres has no clustered index, but the
  primary key's B-tree still takes random inserts as page splits, and the
  write amplification and WAL volume are permanent. UUIDv7 sorts by time
  and keeps the inserts at the right-hand edge.
- `timestamptz` for every timestamp. `timestamp` without a zone is the
  naive datetime problem (§3.1) with a schema migration attached.
- Constraints: PK/FK, CHECK, NOT NULL, unique — the DB is the last line
  of defense; enforce invariants there.
- Indexing: indexes for query patterns, not for looks; composite index
  column order matters; partial indexes; avoid over-indexing writes.
- Transactions short and bounded. A transaction held open across a network
  call is a lock held across a network call.

| Isolation level | Use for |
|---|---|
| Read committed | The default. OLTP reads and writes. |
| Repeatable read | Reports that must see one consistent snapshot. |
| Serializable | Money movement and invariants across rows. Pay: `40001` serialization failures — you must retry them. |

- Row-level security for multi-tenant isolation, when the guarantee has to
  survive an application bug. Pay: policy complexity and planner surprises.
- `SKIP LOCKED` for a database-backed queue; advisory locks for singleton
  jobs. Both are cheaper than a second system.
- Partition on time or tenant once a table passes ~100M rows, or when
  retention means dropping old data.
- Pooling: an application pool plus PgBouncer in transaction mode. Pay: no
  session state, and prepared statements need care.
- Optimistic concurrency with a version column; the API surface for it is
  `If-Match` (`api-design` §5).
- `EXPLAIN ANALYZE` before and after any query change; watch seq scans
  on hot tables, N+1, and cartesian joins.
- Migrations: Alembic, forward-only, additive by default (expand-migrate-
  contract for zero downtime); destructive changes in a later release,
  with a script.
- Every migration sets `lock_timeout` and `statement_timeout`, and builds
  indexes `CONCURRENTLY`. Without a lock timeout, one `ALTER TABLE` queued
  behind a long transaction takes the service down — this is the single
  most common self-inflicted database outage.
- Lint migrations with `squawk`. Alembic autogenerate produces a *draft*;
  a human reads every one.
- Test migrations against a production-shaped snapshot in CI. A migration
  that has only run against an empty schema is untested.
- Backups: tested restores are the only real backup. State RPO and RTO per
  database, and drill the restore quarterly.
- Soft delete or an audit table — decide per aggregate and write it down.
  Both silently, and differently, break `UNIQUE` constraints.
- Review `pg_stat_statements` weekly. The slowest query is rarely the one
  anyone suspected.

### 4.2 ORM discipline (SQLAlchemy 2.0)
- Typed `Mapped[...]` models, `select()` statements, avoid the legacy
  Query API.
- Async: asyncpg driver, one session per request, `expire_on_commit=False`.
  Lazy loads raise under async — treat that as a feature, because the
  alternative is an implicit query inside a template.
- N+1: eager loading (`selectinload`/`joinedload`) deliberately, never by
  accident.
- Bulk operations with `insert().execution_options(synchronize_session=False)`.
- Know when to drop to raw SQL (complex reporting, window functions,
  upserts at scale).
- Pydantic at the boundary, ORM models in the data layer — never leak ORM
  objects into API responses (serialization + coupling).
- Assert query counts in tests. A max-query-count helper on every list
  endpoint is the only N+1 defence that survives a refactor.

### 4.3 NoSQL, caches & queues
Moved to §18.1. Storage is where state lives; §18 is what moves it, and
at 169 lines the two were one section.

### 4.4 Batch and pipeline jobs
Moved to §18.2.

**When not to**: a second datastore is a second thing to back up, secure,
monitor and restore. Earn it with a measured need, not a category.

**How it goes wrong**: an `ALTER TABLE` with no `lock_timeout` on a hot
table, queued behind one long-running transaction, holding an ACCESS
EXCLUSIVE lock while every request piles up behind it.

#### Audit Benchmarks
- Migrations: zero lock-hazardous statements; `lock_timeout` and
  `statement_timeout` set; forward-only; expand/contract for every breaking
  change; run against a production-shaped snapshot in CI. Enforcer:
  migration lint (`squawk` on Postgres) + human review of every migration.
- Query health: zero sequential scans on hot tables over 1M rows;
  `EXPLAIN ANALYZE` attached to any PR touching a hot query. Enforcer:
  weekly `pg_stat_statements` review + PR template.
- N+1: zero, asserted by a max-query-count check on every list endpoint
  test. Enforcer: test helper in CI.
- Schema hygiene: every FK indexed; every expressible invariant a
  constraint; every timestamp `timestamptz`; PII columns tagged. Enforcer:
  schema-lint query in CI.
- Recovery: restore drill quarterly; RTO and RPO documented per database
  and met, with evidence linked. Enforcer: runbook + calendar.
## 5. Resilience & Distributed Systems

The moment a second process is involved, the network is unreliable,
latency is not zero, and the clocks disagree. Everything here follows from
those three facts.

### 5.1 Timeouts
- **Every outbound call has an explicit timeout.** "No timeout" is not a
  default; it is the bug that turns a slow dependency into your outage.
- Budget them as a hierarchy: client < gateway < service < downstream. An
  inner timeout longer than its caller's is dead work — the caller has
  already given up and nobody will read the result.
- Separate connect and read timeouts. A pool starved of connections fails
  differently from a slow endpoint, and you want to tell them apart.

### 5.2 Retries
- Retry only what is idempotent, with exponential backoff and **full
  jitter**. Synchronised retries are how a blip becomes a thundering herd.
- Hold a **retry budget**: cap retries at ~10% of request rate and alert
  above it. Pay: some transient failures reach the caller. Gain: retries
  can never themselves be the outage.
- Never retry a 4xx except 429 with `Retry-After`. A 400 will be a 400
  again; you are just billing yourself for it.
- Retry at one layer. Three layers each retrying three times is
  twenty-seven requests, and nobody planned that number.

### 5.3 Isolation
- **Circuit breakers** (`pybreaker`, `aiobreaker`) on every downstream in
  the critical path. Trip on error *rate* over a window, not on a raw
  count; probe half-open before restoring.
- **Bulkheads**: a connection pool per downstream. One slow dependency
  must not exhaust the pool that serves everything else.
- **Backpressure and load shedding**: bounded queues, admission control,
  and 429/503 with `Retry-After` under overload. Shed low-priority work
  first. A service that fails fast at 2x load is healthier than one that
  collapses at 1.2x.
- **Graceful degradation**: decide the fallback in advance — stale cache,
  reduced result set, feature off. Improvising it at 03:00 is how a
  degradation becomes an incident.

### 5.4 Delivery and idempotency
- Delivery is **at-least-once**. Exactly-once is a property of the
  *consumer*, not of the broker; anyone selling you the latter is selling
  you the former with extra steps.
- Idempotency keys on every mutation, with a dedupe store and a TTL.
- The **outbox** pattern exists to solve the dual-write problem: writing
  to the database and publishing an event cannot be atomic across two
  systems, so write both to the database in one transaction and relay.
  CDC (Debezium) is the same idea with the log as the source.
- **Dead-letter queues** need replay tooling and an owner. A DLQ nobody
  drains is a graveyard with a dashboard.

### 5.5 Sagas and long-lived transactions
- Multi-step work across services is a saga: local transactions plus
  compensations. Compensations are first-class code with their own tests —
  they run on the worst day, not the good one.
- A compensation is not a rollback. Refunding a payment is not the same as
  the payment never happening, and the difference is usually visible to
  the customer.

| | Orchestration | Choreography |
|---|---|---|
| Flow visibility | central, explicit | emergent, read the logs |
| Coupling | to the orchestrator | to event schemas |
| Failure handling | one place | everywhere |
| Best when | complex flows, few teams | simple flows, many teams |

### 5.6 Time, order and locks
- Never order events by wall clock. Clocks skew, NTP steps, and two
  machines will disagree at exactly the wrong moment. Use sequence
  numbers, or hybrid logical clocks when causality matters.
- Use monotonic clocks for durations; a wall clock can go backwards.
- Distributed locks need **fencing tokens** or they are decoration: a
  process paused past its lease will still write. Prefer a database lock
  when the database is already in the transaction.
- Leader election belongs to a Kubernetes lease or the database, not to a
  Redis key expiry.

### 5.7 Multi-tenancy
- Per-tenant limits, pools, and queues. A noisy neighbour is a resilience
  problem before it is a fairness one.
- Cell-based isolation when blast radius matters more than utilisation.

### 5.8 Proving it
- Chaos starts small: kill a pod in staging, then add latency, then fail a
  dependency. Game days quarterly; automated fault injection once the
  basics survive.
- Test the failure path, not just the happy one. A retry with no test is a
  hypothesis.

**When not to**: a single process against one database does not need
sagas, outboxes, breakers, or fencing tokens. It needs one transaction,
and that already works. Adopt each control when a second network hop makes
it true, not in anticipation.

**How it goes wrong**: a retry storm. Every client retries three times, no
budget, no jitter — a ten-second blip becomes a forty-minute outage, and
the graphs show the recovery attempts, not the cause.

#### Audit Benchmarks
- Timeouts: 100% of outbound calls carry an explicit timeout; zero
  unbounded retries. Enforcer: `semgrep` rule + client factory under test.
- Retries: idempotent-only, backoff with jitter, budget <= 10% of request
  rate with an alert above it. Enforcer: metrics + alert rule.
- Isolation: a breaker and a bulkhead on every critical-path downstream.
  Enforcer: dependency inventory + review checklist.
- Consumers: a duplicate-delivery test for every consumer. Enforcer: CI.
- Overload: returns 429/503 at 2x capacity without cascading — tested
  yearly (floor), in perf CI (elite). Enforcer: load-test job.
- Chaos: a game day per quarter (floor); automated fault injection in
  staging (elite). Enforcer: calendar + linked evidence.

---
## 6. Concurrency & Performance

- Choose the right primitive: asyncio (I/O-bound), threading (blocking
  I/O), multiprocessing (CPU-bound), or a compiled extension (Cython/Rust)
  when Python itself is the bottleneck.
- That rule has an expiry. Free-threaded CPython is officially supported
  from 3.14 (PEP 779, accepted 2025), shipped as the separate `3.14t`
  build at 5-10% single-thread overhead. Where it is available, threads
  become a real CPU-parallel option and this calculus changes. Measure on
  `3.14t` before assuming either way.
- Sub-interpreters (PEP 734, 3.12+) are a third parallelism option:
  isolated interpreters in one process, cheaper than processes, without
  the shared-state hazards of threads.
- Profile before optimizing: cProfile, py-spy (production, no restart),
  scalene, `memray` for memory; flamegraphs. Optimize the measured hot
  path, not the imagined one.
- Continuous profiling in production (Pyroscope, Parca) is the fourth
  signal alongside logs, metrics and traces (§10) — it answers "why is it
  slow *now*", which a flamegraph from last Tuesday cannot.
- Latency budgets: p95/p99 targets per endpoint, proved by §10. The
  controls that defend them — timeouts, retries, breakers, backpressure —
  are §5.
- Size pools with Little's law: concurrency = arrival rate x service
  time. Guessing produces a pool that saturates at 60% of the load the
  SLO was written for.
- Tail latency is not average latency (Dean & Barroso, 2013): p99 is
  dominated by the slowest 1% of your dependencies, so fan-out multiplies
  it. Hedged requests help, and only for idempotent calls.
- DB: connection pooling (SQLAlchemy pool), query plans, batch inserts;
  the DB is the bottleneck 90% of the time.
- Performance budgets in CI: `pytest-benchmark` for units, k6 or locust
  with thresholds for endpoints. A regression over 10% fails the job —
  otherwise performance decays one acceptable percent at a time.
- Serialization: `orjson` or `msgspec` when JSON is hot. Servers: uvicorn
  or granian; workers about cores x 1-2, bounded by memory.
- HTTP/2 and HTTP/3 terminate at the edge, not in the application.
- Response payloads: projection and gzip. Pagination and caching are
  contract decisions (`api-design` §2, §5), not tuning knobs.
- Startup vs. runtime: lazy imports, `__slots__`, `sys.intern` — only
  when measured.
- Graceful shutdown: on SIGTERM stop accepting, drain in flight, exit
  inside the pod's grace period. Zero 5xx during a rolling deploy is the
  test that it works.

**When not to**: optimising anything without a flamegraph, and reaching
for async to speed up CPU-bound work. Both feel like progress and produce
none.

**How it goes wrong**: a connection pool sized by guess, which is fine in
staging and saturates in production at the exact load the capacity plan
promised to handle.

#### Audit Benchmarks
- Latency: a p99 target documented per endpoint (floor); perf CI fails on
  a regression over 10% (elite). Enforcer: k6/locust thresholds.
- Evidence: every performance PR carries before/after measurements.
  Enforcer: PR template.
- Deploys: zero 5xx during rolling deploys. Enforcer: canary metrics.
- Capacity: pool and worker sizes derived and written down; saturation
  alerts on every pool and queue. Enforcer: USE metrics + alert rules.

---
## 7. Cybersecurity

Security depth lives in `application-security`, which this file requires.
It carries the OWASP Top 10 (2025) backend mitigations, authentication and
authorization, the secure-coding checklist, supply-chain controls, threat
modeling, pipeline security, and privacy.

What holds here, without opening it:

- Authorization is enforced server-side on every route, deny by default,
  and checked at the object level. A route with no auth dependency is a
  bug, and §9 names the test that finds it.
- Untrusted input is validated at the boundary and never reaches a query,
  a shell, or a deserializer unmediated. Model output is untrusted input
  (§14).
- Secrets live in a KMS or vault, never in the repo, the image, or a log.
- Dependencies and build artifacts are part of the attack surface:
  lockfiles, SBOM, signing, and a cooldown before adopting a new release.
- A change that crosses a trust boundary needs a threat model and an ADR
  (§0).

**When not to**: treating this summary as the security review. It is what
holds without opening `application-security`; the standards, the controls
and the per-concern failure modes are there.

**How it goes wrong**: a route merged with no auth dependency because the
reviewer checked this list — which does say authorization is enforced on
every route — and never opened the file that says how that is proven.

#### Audit Benchmarks
- Verification: ASVS 5.0 Level 2 per release (floor); Level 3 on the
  authentication, session and cryptography chapters (elite). Enforcer:
  release checklist mapped to ASVS.
- Coverage: every control in `application-security` has an owner and a
  gate there; zero benchmarks in that file marked unenforced without a
  stated reason. Enforcer: `mdshop validate` + security review.
- Routes: 100% of routes carry an explicit auth dependency or sit on a
  reviewed public allowlist. Enforcer: router-introspection test in CI.

---
## 8. Testing

### 8.1 pytest mastery
- Fixtures with `scope` discipline; `tmp_path`, `monkeypatch`,
  `capsys`, `caplog`; parametrize for matrix coverage.
- `unittest.mock`: patch where the name is looked up, prefer dependency
  injection over patching globals.
- Test isolation: no shared state, and no network by default (responses
  or respx for HTTP).
- Markers: `unit`, `integration`, `e2e`, `slow`; run fast by default.
- Assertion quality: one behavior per test, descriptive asserts
  (`assert response.status_code == 201` not `assert ok`).
- Configure the suite to be trustworthy: `--strict-markers`,
  `--strict-config`, `filterwarnings = error` (a warning is a future
  failure), `pytest-randomly` for order independence, `pytest-timeout`,
  `pytest-xdist` for speed, `time-machine` for clocks.
- Build test data with factories (`polyfactory`, `faker`), not a pyramid
  of fixtures. Fixtures that build on fixtures become a second program
  with no tests of its own.
- **A flaky test is a bug, not weather.** Fix it or delete it with a
  ticket inside seven days. Never configure CI to retry — that converts a
  real race condition into an intermittent lie.

### 8.2 Beyond unit tests
- **Property-based**: hypothesis for parsers, validators, serializers,
  stateful systems.
- **Contract testing**: Pact between services; consumer-driven contracts
  catch breaking changes before deploy.
- **Mutation testing** (mutmut) on critical modules: kills weak tests.
- **Snapshot testing** (syrupy) for serialization changes — use sparingly,
  review diffs.
- **Architecture tests**: `import-linter` contracts are fitness functions
  (§1.5), and they are tests.
- **Authorization matrix tests**: enumerate routes from the router, cross
  them with roles, assert the expected decision. Generated, never
  hand-listed — a hand-written list omits the route added last week.
- **Migration tests**: up and down against a production-shaped snapshot.
- **Spec-driven fuzzing**: `schemathesis` generates cases from the
  OpenAPI document and finds the 5xx you did not think to write a test
  for.
- **Observability tests**: assert the span and the log line were emitted.
  Telemetry that nothing tests will be silently removed by a refactor.
- Fuzzing (`atheris`) for parsers handling untrusted bytes (elite).
- Integration against real dependencies (Testcontainers) over mocks
  wherever the seam is the risk — a fake Postgres proves nothing about
  your SQL.
- E2E (Playwright) only for critical journeys; keep the count low — they
  are the slowest, flakiest, most expensive layer.
- Load/soak tests (locust, k6) for perf-sensitive endpoints; profile
  before optimizing (measure, then tune, then measure again).
- The pyramid is the default; the *trophy* (integration-heavy) fits thin
  services that are mostly glue. Pick per service and write down which.

**When not to**: E2E for anything a contract test can prove, and mocks for
anything a fake can run. Both trade real coverage for a green tick.

**How it goes wrong**: a suite that passes in every order except the one
CI happens to pick on Friday, because two tests share a row in the
database and nobody randomised the order.

#### Audit Benchmarks
- Speed: PR gate suite < 10 min; E2E < 15 min nightly. Enforcer: CI
  timing alert.
- Coverage: diff coverage >= 80% with branch coverage on (floor); >= 90%
  (elite). Enforcer: `diff-cover` in CI.
- Strength: mutation score >= 70% on `domain/` (elite). Enforcer:
  scheduled `mutmut`.
- Trust: zero retries configured in CI; flaky tests fixed or deleted
  within 7 days; random order and warnings-as-errors on. Enforcer: pytest
  config in repo + flake dashboard.
- Properties: property-based tests on 100% of parsers, serializers and
  validators. Enforcer: review checklist.
- Contracts: every documented response validates under generated input,
  and every consumer contract holds, per release -- zero failures.
  Enforcer: spec-driven fuzzing and a contract-test broker in CI
  (`schemathesis` and Pact here).

---
## 9. Quality Gates: Linters, Formatters, Static Analysis

A principle nothing checks is a preference. This section is where every
rule in this document becomes a job that fails.

### 9.1 The toolchain
- **Ruff** for lint and format in one tool. The mandated families:
  `E,W,F` (pycodestyle, pyflakes), `I` (isort), `UP` (pyupgrade),
  `B` (bugbear), `SIM`, `PERF`, `C90` + `PL` (complexity), `ASYNC`, `S`
  (security), `DTZ` (datetimes), `TID` (banned imports), `ANN`
  (annotations), `D` (docstrings), `PT` (pytest), `T20` (no print),
  `LOG` + `G` (logging), `PTH` (pathlib), `RET`, `ARG`, `ERA` (dead code),
  `TRY` (exception hygiene), `FBT` (boolean traps), `RUF`.
- `RUF100` kills unused `noqa`. Every remaining `noqa` carries a rule code
  and a reason — a bare `# noqa` is an unreviewable exception.
- **Type checker** in strict mode: mypy or pyright as the safe default,
  Pyrefly now credible (§3.2). In CI, not only in pre-commit.
- **semgrep** for the rules Ruff cannot express: a client call without a
  timeout, a string-built query, a route without an auth dependency.
  Custom rules are where your framework's footguns get caught.
- **pip-audit** or **osv-scanner** against the lockfile; **deptry** for
  unused and undeclared dependencies; **gitleaks** for secrets;
  **import-linter** for the dependency rule; **squawk** for migrations;
  **zizmor** and **actionlint** for the pipeline itself; **codespell**;
  **vulture** for dead code (elite).
- **pre-commit** (or `prek`) for fast feedback, and **CI re-runs the same
  hooks**. Never trust the laptop: hooks are installed on some machines,
  and the ones that matter are always the others.
- Coverage with `branch = true`, gated on changed code (`diff-cover`).
  80% is a floor, not a goal, and whole-repo percentage hides the diff
  that added none.
- EditorConfig plus a pinned formatter config: no formatting argument ever
  again.

### 9.2 Principle → enforcer
Every row is a rule stated elsewhere in this library and the thing that
checks it. A bare `§N` points into this file; an id in backticks before
the section number points into another file. Rows marked *review* have no
automated gate and say so, which is honest; a benchmark whose enforcer is
"the team" is a wish.

| Principle | Enforcer | Runs in |
|---|---|---|
| Aware datetimes only (§3.1) | Ruff `DTZ` | pre-commit + CI |
| No blocking calls in async (§3.3) | Ruff `ASYNC`, `TID251` | CI |
| Dependency rule / hexagonal (§1.5) | `import-linter` contracts | CI |
| Cyclomatic <= 10 (§1) | Ruff `C901`, `PLR0912/0913/0915` | CI |
| Exception hygiene (§1.1) | Ruff `TRY`, `B` | CI |
| No boolean traps (§1.1) | Ruff `FBT` | CI |
| Docstrings on public API (§3.5) | Ruff `D` (google) | CI |
| No `print`, structured logs (§10) | Ruff `T20`, `LOG`, `G` | CI |
| `pathlib` over `os.path` (§3.5) | Ruff `PTH` | CI |
| No string-built SQL (`application-security` §2) | Ruff `S608` + `semgrep` | CI |
| No `pickle`/`yaml.load` on input (`application-security` §4) | Ruff `S301`, `S506` | CI |
| No `random` for secrets (`application-security` §4) | Ruff `S311` | CI |
| No `shell=True` with input (`application-security` §2) | Ruff `S602`, `S605` | CI |
| Timeout on every outbound call (§5.1) | `semgrep` custom rule | CI |
| No unused `noqa` (§9.1) | Ruff `RUF100` | CI |
| Dependency hygiene (§3.4) | `deptry`, `uv lock --check` | CI |
| Known vulnerabilities (`application-security` §4.1) | `pip-audit` / `osv-scanner` | CI |
| Secrets never committed (`application-security` §3) | `gitleaks` + push protection | pre-commit + CI |
| Safe migrations (§4.1) | `squawk` | CI |
| No N+1 (§4.2) | query-count assertion helper | CI tests |
| Every route in the spec (`api-design` §1) | `routes ⊆ spec` test | CI tests |
| No unreviewed API break (`api-design` §4) | `oasdiff` | CI |
| API robustness (§2) | `schemathesis` | CI |
| Every route authorised (`application-security` §3) | router-introspection test | CI tests |
| Duplicate-safe consumers (§5.4) | duplicate-delivery test | CI tests |
| Actions pinned, least privilege (§11) | `zizmor`, `actionlint` | CI |
| Image posture (§11) | `trivy`, `cosign`, `syft` | CI + admission |
| Kubernetes policy (§11) | `kube-linter`, Kyverno | CI |
| IaC policy (§11) | `checkov` / `trivy config` | CI |
| Trace propagation (§10) | `traceparent` integration test | CI tests |
| Alerts carry runbooks (§10) | alert-rule lint | CI |
| Docs prose (§12) | `markdownlint`, Vale | CI |
| Conventional Commits (§13) | `commitlint` | CI |
| Prompt/model regressions (§14) | `promptfoo` / `inspect` | CI |
| Abstraction earns its keep (§1.2) | *review* | PR |
| Property tests on parsers (§8.2) | *review* | PR |
| Pattern fit, "when not to" (§1.2) | *review* | PR |

**When not to**: a rule family producing more `noqa` than fixes in its
first week is not earning its place. Disable it with an ADR rather than
letting the codebase fill with suppressions.

**How it goes wrong**: pre-commit installed on three of eight laptops, CI
not re-running the hooks, and a `main` branch that has not been formatted
consistently since March.

#### Audit Benchmarks
- Lint: Ruff clean on the mandated families; zero unused `noqa`. Enforcer:
  CI.
- Types: a checker runs in CI and the untyped-module list only shrinks
  (floor); strict clean, zero blanket ignores, `warn_unused_ignores` on,
  and <= 5 reasoned `type: ignore[code]` per kLOC (elite). Enforcer: CI,
  on a checked-in exclusion list.
- Security lint: zero unresolved security-lint findings — every one fixed,
  or suppressed with a written reason. Enforcer: Ruff `S` and `semgrep` in
  CI for the count and `RUF100` for the suppression staying live; review
  for the reason, which no linter can read.
- Dependencies: one resolved manifest, CI installs from it, and the
  resolution is verifiable (floor); `deptry` zero, `uv lock --check`
  passing and `exclude-newer` >= 7 days (elite). Enforcer: CI.
- Parity: zero checks in the contributor's documented gate that CI does not
  also run, over the same paths and from the same manifest (floor); the two
  are one command, so they cannot drift (elite). Enforcer: review of the
  two side by side at the floor -- CI cannot check that it matches a
  document -- and at elite the single entry point is itself the enforcer.
- Pipeline: the pipeline definitions pass a security audit with zero high
  findings and a syntax lint; every third-party step pinned by immutable
  reference, never a moving tag. Enforcer: CI (`zizmor` and `actionlint`
  on GitHub Actions; the equivalent audit on whatever runs your builds).

---
## 10. Observability

- **Logging**: structured JSON (structlog), correlation/request IDs
  propagated across services, log levels with meaning (ERROR = action
  required), never log secrets/PII.
- **Metrics**: Prometheus counters/gauges/histograms; RED (rate, errors,
  duration) for services, USE (utilization, saturation, errors) for
  resources.
- **Tracing**: OpenTelemetry end-to-end, with the Collector in the path so
  the backend is swappable. Follow the semantic conventions — a custom
  attribute name is a dashboard nobody else can reuse. W3C `traceparent`
  propagated in and out, carried through `contextvars` (§3.3).
- **Exemplars** link a histogram bucket to a trace: click the slow bucket,
  land on the request. This is the single feature that turns three
  disconnected signals into one tool.
- Sampling: head-based for the bulk, **tail-based** so every error and
  every slow request is kept. Sampling away your incidents is the default
  failure mode of cheap tracing.
- **Canonical log lines**: one wide event per request carrying every
  dimension you might filter by — route, tenant, user, status, duration,
  version, feature flags. Pay: cardinality, so budget it. Gain: most
  incident questions become one query instead of a join across three
  systems. This is the highest-leverage logging change most teams have
  not made.
- **SLOs/SLIs**: availability and latency SLOs with error budgets, defined
  from quality-attribute scenarios (§1.5), not invented at dashboard time.
  Tooling: `sloth` or Pyrra.
- Alert on **multi-window, multi-burn-rate** (SRE Workbook, 2018): a fast
  window to catch the outage, a slow one to catch the slow bleed. Raw
  thresholds page you at 3am for a spike that self-healed at 3:01.
- Every alert carries a `runbook_url`. An alert without one is a page to
  someone who cannot act on it.
- Health endpoints: liveness must not depend on downstreams — otherwise a
  database blip restarts every pod and turns a degradation into an outage.
  Readiness may; startup probes for slow boots.
- Dashboards are for humans: 5-7 panels per service, as code, reviewed
  like code. Do not carpet-bomb.
- Continuous profiling is the fourth signal (§6).
- Observability is a bill. Budget log volume and metric cardinality, and
  alert when either doubles — an unbounded label is how a $2k month
  becomes a $40k month.

**When not to**: tracing 100% of production traffic, and a dashboard per
engineer. Both cost real money and neither answers a question faster.

**How it goes wrong**: the alert that fires at 03:00 with no runbook, to
the engineer who did not write the service, about a threshold nobody can
connect to a user-visible symptom.

#### Audit Benchmarks
- Coverage: RED metrics on every service, USE on every resource;
  dashboards as code. Enforcer: dashboard lint in CI + review.
- Propagation: 100% of inbound and outbound requests carry `traceparent`,
  asserted by an integration test. Enforcer: CI.
- SLOs: error budgets for every user-facing service; multi-window
  burn-rate alerts; 100% of alerts carry a `runbook_url`. Enforcer:
  alert-rule lint in CI.
- Hygiene: zero secrets or raw PII in logs and traces. Enforcer: redaction
  processor + log-scan test.
- Answerability: a new engineer answers "is it healthy, and what broke" in
  10 minutes, tested at every game day. Enforcer: quarterly game day.
- Cost: log volume and cardinality within budget, alert at 2x baseline.
  Enforcer: collector metrics + alert.

---
## 11. DevOps & Infrastructure

- **Docker**: multi-stage builds (builder + slim runtime), non-root user,
  distroless or Wolfi/Chainguard images when possible (no shell: a much
  smaller CVE list, and harder debugging — that is the trade),
  healthchecks, `.dockerignore`, base images pinned by digest. Read-only
  root filesystem, all capabilities dropped, `trivy` clean of criticals,
  signed with `cosign`, SBOM attached. With uv: `uv sync --frozen
  --no-dev` and bytecode compiled at build time.
- **Orchestration**: Kubernetes (deployments, services, probes, HPA) well
  enough to run and debug, not to administer a fleet. Requests and limits
  on every pod; all three probe types; PodDisruptionBudgets so a drain
  cannot take the last replica; topology spread; the *restricted* Pod
  Security Standard; default-deny NetworkPolicy. Enforce with
  `kube-linter` and Kyverno, not with review.
- GitOps (Argo CD, Flux) with progressive delivery (Argo Rollouts,
  Flagger). Secrets via External Secrets, never in a manifest.
- **IaC**: OpenTofu or Terraform (BSL-licensed since 2023 — the fork is
  the reason OpenTofu exists) for infra, Ansible for config; state in
  remote
  backend, plan in CI, apply with review; no click-ops.
- **Linux**: systemd units, journalctl, process/socket debugging (ss,
  lsof, strace), filesystem and permissions (the Linux skill domain).
- **Networking**: TCP/HTTP/TLS/DNS mental model, HTTP/2, connection
  pooling, reverse proxies (nginx/Caddy), service discovery.
- **CI runners**: cache dependencies, build once, promote the artifact,
  immutable versions. Authenticate to the cloud with **OIDC** — zero
  static credentials in CI. A `permissions:` block in every workflow,
  actions pinned to a SHA, ephemeral runners.
- Preview environment per PR (elite). Drift detection weekly; policy as
  code (`checkov`, Conftest) on every plan.
- DR: multi-AZ by default, RTO and RPO stated per service, multi-region
  only when an SLO demands it. FinOps: tag everything, right-size, treat
  cost as a metric with an owner.
- Platform engineering: golden paths, not mandates. A paved road people
  choose beats a policy people route around.

### 11.1 Service runtime contract
Twelve-factor, plus the three factors the original list predates.

- Config from the environment, typed and validated at startup
  (pydantic-settings), with a documented precedence order. A service that
  boots with a missing variable and fails an hour later is a config bug
  you chose not to catch.
- Stateless processes; state in a datastore. Logs to stdout as a stream —
  the process does not manage files, rotation, or shipping.
- Disposability: fast start, graceful stop (§6). Dev/prod parity through
  the same container image. Admin tasks as one-off jobs against the same
  image, never a shell on a running pod.
- The three additions: **API-first** (the contract precedes the code,
  `api-design` §1), **telemetry** (§10), and **authentication and
  authorization** as
  a platform concern, not a per-service reinvention
  (`application-security` §3).

**When not to**: a service mesh for six services, and Kubernetes for one.
Both are answers to problems of scale you may not have.

**How it goes wrong**: a workflow with `permissions: write-all` calling an
unpinned third-party action, which is a supply-chain compromise with a
green tick (`application-security` §4.1).

#### Audit Benchmarks
- Images: non-root, read-only filesystem, no shell, base pinned by digest,
  zero known critical vulnerabilities in the shipped image, signed, SBOM
  attached. Enforcer: container scanner in CI + admission controller.
- Kubernetes: 100% of pods carry requests, limits and three probes; PDBs
  present; restricted PSS; default-deny network policies. Enforcer:
  `kube-linter` + Kyverno in CI.
- IaC: 100% of infrastructure in code; policy checks zero high; drift
  checked weekly. Enforcer: CI + scheduled job.
- Pipeline: OIDC only, zero static cloud credentials; least-privilege
  `permissions:` in every workflow; actions SHA-pinned. Enforcer: CI +
  `zizmor`.
- Rollback: under 5 minutes, exercised monthly. Enforcer: game day +
  deploy tooling.
- Recovery: RTO and RPO documented per service; multi-AZ by default.
  Enforcer: architecture review.

---
## 12. Architecture & Design Documentation

### 12.1 C4 model (the default for system diagrams)
- Level 1 Context — system, users, external systems (1 diagram).
- Level 2 Containers — apps, databases, queues, their responsibilities.
- Level 3 Components — modules inside a container.
- Level 4 Code — class diagrams (rarely needed; keep generated).
- Diagrams as code, in version control:
  - Structurizr DSL (best for C4, renders to Mermaid/PlantUML/web).
  - PlantUML (`.puml`, easy in-repo), Mermaid (docs/README friendly).
- Dynamic and deployment views when the runtime shape is the question.
  Structurizr Lite renders locally, so a diagram change is reviewable.
- Rules: one level per diagram; names and descriptions on every box; no
  technology jargon in level 1; **the diagram changes in the same PR as
  the topology**, or it is already wrong.
- arc42 as the skeleton when a full architecture document is warranted.

### 12.2 BPMN 2.0 (process modeling)
- Use for business processes with real branching, parallel flows, and
  handoffs: swimlanes (pools/lanes), events (start/end/intermediate),
  gateways (exclusive `X`, parallel `+`, inclusive), tasks, subprocesses.
- Tools: Camunda 8 (modeler + engine), bpmn-js (embeddable), draw.io.
- Conventions: one start event, clear end states, named gateways with
  conditions, no crossing lines, deadlocks are bugs.
- When BPMN is overkill: linear scripts → flowcharts or plain steps.
- Always pair with the data model: processes consume/produce state.

### 12.3 UML essentials (only what earns its keep)
- Sequence diagrams (interaction contracts, async flows).
- Class diagrams (domain model reviews).
- State machine diagrams (order lifecycle, sagas).
- Skip: use-case diagrams (stakeholder theater), most deployment diagrams.

### 12.4 Documentation discipline
- ADRs in MADR format: status, context, decision, consequences. One file
  per decision, numbered, immutable once accepted — supersede, never edit.
  The triggers are listed in §0.
- RFCs for significant changes: short, reviewable, with a named decision
  owner and a deadline. An RFC with neither is a discussion.
- **Diátaxis** for everything else: tutorial, how-to, reference,
  explanation. Most bad documentation is two of these fighting in one
  page.
- Reference documentation is generated, not written: the OpenAPI document
  *is* the API reference (`api-design` §1).
- Runbooks in one shape: symptom → verify → mitigate → root-cause →
  escalate. Written for someone paged at 3am who did not build it.
- README: what, why, and running in five minutes. Test that claim on every
  new joiner; a failure is an issue, not an anecdote.
- Docs are code: versioned with it (mkdocs-material + mike), reviewed,
  linted (`markdownlint`, Vale) in CI.

**When not to**: UML use-case diagrams, and any wiki outside the repo.
Both drift from the code the moment they are written.

**How it goes wrong**: the C4 container diagram that still shows the queue
you removed a year ago, trusted completely by the engineer who joined last
week.

#### Audit Benchmarks
- Currency: C4 L1 and L2 exist per system and change in the same PR as any
  topology change; reviewed quarterly. Enforcer: PR template, CODEOWNERS
  and a calendar reminder.
- Decisions: ADRs in MADR format; zero "proposed" older than 30 days;
  every §0 trigger in a merged PR has one. Enforcer: ADR lint + review.
- Onboarding: the README five-minute test passes at every onboarding;
  failures become issues. Enforcer: onboarding checklist.
- Diagrams: as code only; zero orphan images under `docs/`. Enforcer: CI
  check.
- Process models: BPMN validates, gateways named, no deadlocks, matches
  the state model. Enforcer: modeler validation + review.
- Prose: docs lint clean. Enforcer: CI.

---
## 13. Methodologies & Process

### 13.1 Version control
- Trunk-based development with short-lived branches (or GitHub Flow).
  Long-lived branches rot. Default: rebase locally, squash-merge small
  single-author PRs, merge commit for multi-author branches. Pick one,
  write it down, enforce it in branch protection — the cost of two
  policies is a history nobody can read.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`,
  `test:`, `perf:`, `ci:` + optional scope; breaking changes marked.
- Semantic Versioning, over *meaning*: a breaking change never ships in a
  MINOR.
- Atomic commits: one logical change per commit; commit messages explain
  WHY, not what (the diff shows what).
- Protected main: required reviews, CI green, linear history, no
  force-push, signed commits (SSH or `gitsign`). Configure it **as code**
  and audit it — a protection rule someone can turn off in a settings page
  is not a control.
- CODEOWNERS on the directories that carry risk. A merge queue once the
  team is large enough that `main` breaks from semantic conflicts; stacked
  PRs for changes too large to review in one sitting.

### 13.2 Testing as a practice
Technique is §8. These are the two process questions it does not answer.

- TDD: red-green-refactor for logic-heavy code. The test is the first
  consumer of your API — write it as one, and design problems surface
  before the implementation calcifies around them.
- BDD only with a stakeholder in the room. Gherkin's automation is a
  bonus; the shared language is the entire point, and without the
  stakeholder you have bought the syntax and none of the value.

### 13.3 Code review
- Author: small PRs (aim < 400 lines), self-review before requesting,
  describe intent and risk in the description.
- Reviewer: ask questions before demands, cite specifics, no drive-by
  nitpicks on style the linter owns. **The reviewer is not QA** — if the
  gates did not catch it, the gate is the bug.
- Conventional Comments (`nit:`, `suggestion:`, `issue:`, `question:`) so
  severity is explicit and a nit does not read as a block. Approve-with-
  nits is a real outcome; use it.
- A review SLA the team agrees to, because a PR waiting two days is two
  days of merge conflict accruing.
- AI-assisted first pass is fine; the human pass is not optional, and AI
  output is reviewed as a third-party contribution (§14).

### 13.4 CI/CD
- CD: build once, promote the artifact (immutable builds); never rebuild
  in production.
- Deployment strategies: rolling, blue-green, canary, progressive
  delivery. Feature flags for risky releases — **flags expire**, and flag
  debt is debt with a scheduled removal date.
- Migrations decouple from deploys (§4.1): expand, deploy, contract.
- DORA as the audit, in its current form (five metrics since 2024):
  deployment frequency, change lead time, change fail rate, failed
  deployment recovery time (renamed from time-to-restore in 2023), and
  deployment rework rate.
- Treat the performance tiers as a description, not a scorecard. They were
  always the output of cluster analysis rather than fixed thresholds, so
  the numbers behind "elite" moved year to year, and the 2025 report
  (retitled *State of AI-assisted Software Development*) drops the labels.
  Track your own trend across the five metrics; a team improving on all
  five is the signal, and a tier is not a target.

### 13.5 Incident response
- On-call rotations with runbooks; severity taxonomy (SEV1-3) defined in
  advance.
- Named roles during an incident: incident commander and communications
  lead, distinct from whoever is debugging. The person fixing it cannot
  also be writing the status page.
- Blameless postmortems within five business days: timeline, impact, root
  cause, action items with owners and dates. The system failed, not the
  person — and a postmortem with unowned actions is a diary entry.
- An **error-budget policy** decided in advance: what actually happens
  when the budget is spent. Usually "feature work stops until reliability
  work lands". A budget with no consequence is a metric.

### 13.6 The team as a system
- Team Topologies: stream-aligned teams doing the work, platform teams
  paving roads, enabling teams teaching, complicated-subsystem teams where
  depth demands it. Conway's law is a design input — you will ship your
  org chart, so choose it.
- Humane on-call: a rotation of at least six, a target for pages per
  shift, and time to fix what paged you. An on-call rotation that burns
  people is an availability risk, not a staffing one.
- Psychological safety is the precondition for blameless anything. Without
  it the postmortem is theatre and the timeline is edited.
- Tie the engineering ladder to this file's floor and elite levels, so
  "senior" means something checkable.

**When not to**: BDD without a stakeholder in the room, and a merge queue
for a team of two. Both are ceremony bought before the problem.

**How it goes wrong**: a 1,200-line PR approved in eleven minutes, because
the reviewer had five others waiting and no SLA that made saying "split
this" cheaper than saying "LGTM".

#### Audit Benchmarks
- Size: PR p50 under 200 changed lines, p90 under 400. Enforcer: PR-size
  bot.
- Latency: first review within 24h (floor); within 4h (elite). Enforcer:
  review metrics.
- Commits: 100% Conventional Commits on main. Enforcer: `commitlint`.
- Protection: required review, required checks, linear history, signed
  commits, no force-push — configured as code. Enforcer: settings-as-code
  and a quarterly audit.
- Delivery: all five DORA metrics tracked and trending the right way over
  two quarters (floor); on-demand deploys, change lead time under a day,
  change fail rate 0-2%, failed deployment recovery under an hour (elite,
  and these are the most recently published top-cluster figures, not a
  permanent bar). Enforcer: DORA dashboard.
- Learning: postmortem within 5 business days for SEV1/2; 100% of action
  items owned and dated; >= 90% closed within 30 days. Enforcer: incident
  tracker.

---
## 14. AI/LLM-Era Engineering

The playbook lives in `llm-engineering`, which this file `see_also`s. It
carries models as dependencies, prompts as code, evals, retrieval, agents,
guardrails, cost and latency, reliability, data governance, and
AI-assisted engineering.

What holds here, without opening it:

- **Model output is untrusted input.** Closer to a form submission than to
  a return value: validate it, never `eval` it, never let it reach a
  shell, a query, or a privileged call unmediated.
- **The controls live outside the model.** No prompt defends itself,
  because an instruction competes with every other instruction in the
  context including one an attacker put there. What holds is what the
  model may do, what its output may reach, and what it may spend.
- **Models are dependencies**: pin the identifier, never a floating alias,
  and upgrade by PR with an eval diff attached.
- **Evals are the unit of work**, and a regression past a per-feature
  threshold blocks merge. A feature without an eval is a hypothesis you
  have deployed to users.
- **An agent gets least-privilege tools, a human gate on irreversible
  actions, a sandbox with egress allowlisted, and four ceilings per run —
  tokens, steps, wall-clock and cost.** Every tool call is audited.
- **AI-generated code is a third-party contribution**: same gates, same
  review, and the author is the human who merged it.

**When not to**: treating this summary as the playbook. It is what holds
without opening `llm-engineering`; the thresholds, the trade-offs and the
per-concern failure modes are there.

**How it goes wrong**: an agent shipped with three of the four ceilings,
because this list was read instead of the playbook, and the one omitted is
the step ceiling — so a loop burns the token budget in an afternoon and
nothing stops it, because nothing was counting steps.

#### Audit Benchmarks
- Evals: regressions past the per-feature threshold block merge; every
  prompt, model, retrieval or guardrail change runs them. Enforcer: CI
  eval job.
- Pinning: zero floating model aliases in any configuration. Enforcer:
  config lint in CI.
- Coverage: every control in `llm-engineering` has a gate there; zero
  benchmarks in that file marked unenforced without a stated reason.
  Enforcer: `mdshop validate` + review.

---
## 15. Canon

The sources behind the rules in this file. Each line says what the work
settles, so you can go and check rather than take this document's word for
it. A knowledge base that cannot be audited against the outside world is a
rumour with good formatting.

- Kleppmann, *Designing Data-Intensive Applications* (2017) — the
  reference for storage, replication, consistency and stream processing.
- Nygard, *Release It!* 2e (2018) — where timeouts, bulkheads, circuit
  breakers and the stability patterns in §5 come from.
- Evans, *Domain-Driven Design* (2003); Vernon, *Implementing DDD* (2013)
  — strategic and tactical DDD respectively. Read Vernon to apply Evans.
- Martin, *Clean Architecture* (2017) — the dependency rule, which §1
  turns into an `import-linter` contract.
- Newman, *Building Microservices* 2e (2021) — decomposition, and the
  costs the first edition's readers underestimated.
- Skelton & Pais, *Team Topologies* (2019) — Conway's law as a design
  input rather than an excuse.
- Forsgren, Humble & Kim, *Accelerate* (2018), plus the annual DORA
  report — the evidence that delivery speed and stability rise together.
- Beyer et al., *Site Reliability Engineering* (2016) and *The SRE
  Workbook* (2018) — SLOs, error budgets, and the burn-rate alerting in
  §10.
- Ford, Parsons & Kua, *Building Evolutionary Architectures* 2e (2022) —
  fitness functions, the idea that architecture is testable.
- Geewax, *API Design Patterns* (2021) — the resource and evolution
  patterns in §2.
- Shostack, *Threat Modeling* (2014) — STRIDE done properly.
- Anderson, *Security Engineering* 3e (2020) — why controls fail in the
  real world, which is rarely cryptographic.
- OWASP **ASVS 5.0** (2025), the Cheat Sheet Series, and the Top 10 family
  — ASVS is the standard you verify against; the Top 10 lists are
  awareness, not an audit.
- Dean & Barroso, "The Tail at Scale" (2013) — why p99 is a property of
  your slowest dependency and not of your median.
- Kleppmann, "How to do distributed locking" (2016) — the fencing-token
  argument in §5.6.
- King, "Parse, don't validate" (2019) — the type-level framing behind
  §1.1 and §3.2.
- McKinley, "Choose Boring Technology" (2015) — innovation tokens, and the
  reason §1 defaults are dull on purpose.

---
## 16. Master Audit Benchmarks (wave-end checklist)

One row per domain, **rendered from that domain's block** by `mdshop
master`. The block is authoritative; this table is the index, and
`mdshop validate` errors when the two disagree. Do not edit it by hand —
this table was hand-kept until ADR 0008 and drifted three rows of fourteen
in a single plan, one of them naming a tool that had already been removed
from the block it indexes.

The thresholds are in the blocks. This says what each domain measures and
what checks it; §N is where the floor and the elite condition live.

| Domain | Measures | Enforcers | Block |
|---|---|---|---|
| Engineering Fundamentals | Dependency rule; Deviations; Complexity; Abstraction fit | an import-contract checker in CI (`import-linter`); PR template + CODEOWNERS on `docs/adr/`; Ruff `C901`, `PLR0912/0913/0915`; review checklist | §1 |
| API Design & the Frontend Contract | Inventory; Breaking changes; Coverage | CI test; `oasdiff` in CI; `mdshop validate` + review | `api-design` |
| Core Python Mastery | Versions; Async hygiene; Datetimes; Layout | CI matrix; Ruff `ASYNC` + `TID251` banning `requests` and `time.sleep` in async packages; Ruff `DTZ`; CI (`uv sync`, then test from a clean checkout) | §3 |
| Data & Storage | Migrations; Query health; N+1; Schema hygiene; Recovery | migration lint (`squawk` on Postgres) + human review of every migration; weekly `pg_stat_statements` review + PR template; test helper in CI; schema-lint query in CI; runbook + calendar | §4 |
| Resilience & Distributed Systems | Timeouts; Retries; Isolation; Consumers; Overload; Chaos | `semgrep` rule + client factory under test; metrics + alert rule; dependency inventory + review checklist; CI; load-test job; calendar + linked evidence | §5 |
| Concurrency & Performance | Latency; Evidence; Deploys; Capacity | k6/locust thresholds; PR template; canary metrics; USE metrics + alert rules | §6 |
| Cybersecurity | Verification; Coverage; Routes | release checklist mapped to ASVS; `mdshop validate` + security review; router-introspection test in CI | `application-security` |
| Testing | Speed; Coverage; Strength; Trust; Properties; Contracts | CI timing alert; `diff-cover` in CI; scheduled `mutmut`; pytest config in repo + flake dashboard; review checklist; spec-driven fuzzing and a contract-test broker in CI (`schemathesis` and Pact here) | §8 |
| Quality Gates: Linters, Formatters, Static Analysis | Lint; Types; Security lint; Dependencies; Parity; Pipeline | CI; CI, on a checked-in exclusion list; Ruff `S` and `semgrep` in CI for the count and `RUF100` for the suppression staying live; review for the reason, which no linter can read; review of the two side by side at the floor -- CI cannot check that it matches a document -- and at elite the single entry point is itself the enforcer; CI (`zizmor` and `actionlint` on GitHub Actions; the equivalent audit on whatever runs your builds) | §9 |
| Observability | Coverage; Propagation; SLOs; Hygiene; Answerability; Cost | dashboard lint in CI + review; CI; alert-rule lint in CI; redaction processor + log-scan test; quarterly game day; collector metrics + alert | §10 |
| DevOps & Infrastructure | Images; Kubernetes; IaC; Pipeline; Rollback; Recovery | container scanner in CI + admission controller; `kube-linter` + Kyverno in CI; CI + scheduled job; CI + `zizmor`; game day + deploy tooling; architecture review | §11 |
| Architecture & Design Documentation | Currency; Decisions; Onboarding; Diagrams; Process models; Prose | PR template, CODEOWNERS and a calendar reminder; ADR lint + review; onboarding checklist; CI check; modeler validation + review; CI | §12 |
| Methodologies & Process | Size; Latency; Commits; Protection; Delivery; Learning | PR-size bot; review metrics; `commitlint`; settings-as-code and a quarterly audit; DORA dashboard; incident tracker | §13 |
| AI/LLM-Era Engineering | Evals; Pinning; Coverage | CI eval job; config lint in CI; `mdshop validate` + review | `llm-engineering` |
| Caches, Queues & Pipelines | Cache; Jobs; Data quality | key-audit script + review; CI test + alert rule; pipeline test step | §18 |

Two standards sit above the table and are audited at campaign end, not per
wave: **12-factor** plus the runtime contract in §11.1, and **ISO/IEC
25010:2023** — nine characteristics, of which this document is answerable
for performance efficiency, security, reliability, maintainability,
flexibility and safety.

---
## 17. Wave Workflow (how to apply this document)

1. **Plan the wave**: pick the domains relevant to the task; read their
   benchmark blocks first, so you know what you will be measured against
   before you write anything.
2. **Iterate**: small, reviewable increments; lint, type-check and test
   continuously. Structural changes land in separate commits from content.
3. **Wave-end audit**: measure against the domain benchmarks. Every floor
   benchmark for a touched domain either passes or has a ticket with an
   owner and a date. Record the result — an unmeasured wave is not done.
4. **Campaign-end audit**: review the system as a whole. Quality
   attributes interact, and a component win that costs the system is a
   loss. Sweep specifically for **contradictions**: two sections giving
   opposing guidance on one question is the highest-severity defect this
   document can carry, because it discredits the correct one too.
5. **Record**: an ADR for every deviation taken during the campaign (§0),
   and leave the knowledge base better than you found it.

**Definition of done for a wave**: floor benchmarks pass or are ticketed;
the wave's decisions are recorded; the gates in §9 are green. Anything
less is a wave that stopped, not a wave that finished.

---
## 18. Caches, Queues & Pipelines

Moved from §4.3 and §4.4 (ADR 0008 §2), verbatim. Storage is where
state lives; this is what moves it.

### 18.1 NoSQL, caches & queues — when they actually win
- Document (MongoDB): flexible schemas, denormalized reads. Rarely the
  right answer for a relational domain; "it scales" is not a reason when
  Postgres scales past your roadmap.
- Key-value (Redis / Valkey): caching, rate limiting, locks, queues,
  session store. Licensing matters here — Redis went source-available in
  2024 and added AGPLv3 back in Redis 8 (2025); Valkey is the BSD fork
  under the Linux Foundation. Choose on licence and managed availability,
  and record the choice.
- Distributed locks: `SET NX PX` plus a **fencing token**, or nothing.
  Do not build correctness on Redlock (Kleppmann, 2016) — prefer a
  database lock when the database is already in the transaction (§5.6).
- Columnar (ClickHouse, DuckDB, Parquet): analytics and time series.
- Search (OpenSearch, Meilisearch): full-text and faceting; hybrid BM25 +
  vectors when relevance matters.
- Object storage: presigned URLs. Never proxy bytes through the app
  (`api-design` §8).

| Queue / stream | Ordering | Replay | Throughput | Ops cost |
|---|---|---|---|---|
| Postgres `SKIP LOCKED` | per-row | via table | low-medium | none — you already run it |
| Redis Streams | per-stream | bounded | high | low |
| RabbitMQ | per-queue | no | medium-high | medium |
| Kafka | per-partition | full, retained | very high | high |
| SQS | FIFO variant only | no | high | none (managed) |

- Cache patterns: cache-aside with a TTL and explicit invalidation;
  write-through for hot writes; stampede protection with locks and
  jittered TTLs; **never cache an authorization decision**.
- Data contracts and a schema registry (Avro/Protobuf) for events crossing
  a team boundary. Retention and erasure are pipelines, not tickets
  (`application-security` §7).

### 18.2 Batch and pipeline jobs
The work that runs on a schedule rather than a request, and fails on a
Sunday rather than in a deploy.

- **Every job is idempotent and re-runnable.** The question is not whether
  it will be run twice; it is whether the second run is safe. Design for
  re-running the same window, because you will.
- **Backfill is a first-class path, not a script someone writes at 2am.**
  It runs the same code as the scheduled path with a different window, and
  it is tested. A backfill written under pressure is where the duplicate
  rows come from.
- **Watermarks, not wall clocks.** Process by a recorded high-water mark
  in the data, not by "since yesterday" — late-arriving rows and a clock
  that skews (§5.6) both silently drop work otherwise.
- Data-quality assertions are tests with an owner: row counts within an
  expected band, no unexpected nulls in a required column, referential
  integrity across the join. A pipeline that produces wrong numbers
  quietly is worse than one that fails loudly.
- Orchestration when there is a real DAG with dependencies and retries;
  `cron` and a lock when there is not. A scheduler is a service to run.
- Jobs get the observability a service gets (§10): duration, rows
  processed, failure rate, and an alert on *not running*, which is the
  failure nothing else notices.

**When not to**: an orchestrator for three independent hourly jobs is a
platform you now operate to solve a problem `cron` had already solved.
And a second datastore is a second thing to back up, secure, monitor and
restore — earn it with a measured need, not a category.

**How it goes wrong**: the nightly job that stopped running in March,
noticed in June, because every alert was about jobs that failed and none
about a job that never started.

#### Audit Benchmarks
- Cache: 100% of keys carry a TTL; stampede protection on hot keys; zero
  cached authorization decisions. Enforcer: key-audit script + review.
- Jobs: 100% of scheduled jobs are idempotent with a re-run test over the
  same window, and alert on *not running* within their interval — not
  only on failing. Enforcer: CI test + alert rule.
- Data quality: every pipeline asserts row counts within a stated band,
  zero unexpected nulls in required columns, and referential integrity
  across its joins; a failure pages an owner. Enforcer: pipeline test
  step.

---
