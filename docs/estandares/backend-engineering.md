# Backend Engineering Skill Set — Professional Level

Knowledge base for ALLOGENES, maintained by CLARENT.
Python-first. Operated in waves: analyze -> iterate -> audit against the
benchmarks at the end of each domain -> audit the whole as a system.

---
## 0. Operating Doctrine

- Every domain below ends with an **Audit Benchmarks** list. At wave end,
  measure the work against those standards, not against feelings.
- At campaign end, audit the system as a whole: quality attributes interact
  (security vs. performance vs. maintainability). Component wins that break
  the system are losses.
- Direct approach is for the weak. Find the flank: the root cause, the
  cheapest constraint, the design that dislocates the whole problem.
- Never execute anything without express permission. Explain risk and
  reasoning first.

---
## 1. Core Python Mastery

### 1.1 Language fundamentals (beyond syntax)
- Data model: dunder methods, protocols (PEP 544), descriptors, metaclasses
  (know them; use them rarely), context managers, iterators/generators,
  decorators with `functools.wraps`.
- Namespaces, scoping, closures, `__slots__` and when they matter.
- Error handling: exceptions as control flow only for exceptional paths;
  `raise ... from` chains; custom exceptions inheriting from a domain base.
- `dataclasses`, `Enum`/`StrEnum`, `functools` (cache, partial, singledispatch),
  `itertools`, `collections.abc` — standard library depth is a superpower.
- `datetime` vs `zoneinfo` (never naive `datetime` for storage).

### 1.2 Typing (non-negotiable at professional level)
- Full type hints on all public code; `pyproject.toml` with mypy/pyright
  strict: `strict = true`, `disallow_untyped_defs`, `warn_unused_ignores`.
- TypedDict, Protocol, `TypeVar`/`Generic`, `Literal`, `Final`, `Self`,
  `Never`, overloads. Prefer `collections.abc` generics.
- `dataclasses` + `frozen=True` for value objects; Pydantic for boundary types.
- Runtime validation at the edge (Pydantic), type checking inside.

### 1.3 Async
- `asyncio` mental model: event loop, tasks vs coroutines, `asyncio.gather`
  vs `TaskGroup` (Python 3.11+), timeouts (`asyncio.timeout`),
  cancellation semantics, `run_in_executor` for blocking calls.
- Never block the loop: sync DB drivers/`requests` in async code is a bug.
- Prefer native async drivers: asyncpg, aiosqlite, httpx, redis-py asyncio.
- Concurrency libraries: `anyio` for portability, `uvloop` for throughput.

### 1.4 Packaging & tooling (2026 standard)
- `uv` as the default toolchain (or poetry/pip-tools for legacy projects).
- `pyproject.toml` is the single source of truth (PEP 621).
- Lockfiles committed; `uv.lock`/`poetry.lock`. Reproducible installs.
- Virtualenvs per project; never pip-install into system Python.
- Project layout convention:
```
app/
  api/          # HTTP layer (routers, schemas, auth dependencies)
  domain/       # business rules, entities, value objects (no deps)
  application/  # use cases / services orchestration
  infrastructure/ # db, cache, queue, external clients
  core/         # config, logging, common utilities
tests/
  unit/  integration/  e2e/
```
- Config management: pydantic-settings; env vars, never hardcoded.

### 1.5 Style conventions
- PEP 8 (via Ruff), PEP 20 (Zen of Python) as taste filter.
- Naming: `snake_case` functions/vars, `CamelCase` classes, `UPPER_CASE`
  constants, `_private`/`__private` semantics; verbs for functions,
  nouns for objects.
- Docstrings: PEP 257, Google style; docstring public APIs, not internals.
- Imports: isort ordering (stdlib, third-party, first-party), absolute
  imports, no `*`.

---
## 2. Engineering Fundamentals

### 2.1 Design principles
- SOLID — with the *why*: SRP (one reason to change), OCP (open for
  extension), LSP (substitutability), ISP (small interfaces), DIP (depend
  on abstractions, inject dependencies).
- DRY vs. premature abstraction: DRY after the third duplication, not the
  first.
- YAGNI, KISS, Law of Demeter, composition over inheritance.
- Fail fast, fail loud: validate at boundaries; never silently swallow
  exceptions.

### 2.2 Design patterns (GoF essentials)
- Creational: factory, builder, singleton (as an anti-pattern unless
  genuinely needed).
- Structural: adapter, facade, repository, dependency injection container.
- Behavioral: strategy, observer/event emitter, command, template method,
  state machine.
- Know when NOT to use a pattern: patterns are vocabulary, not goals.

### 2.3 Architecture styles
- **Clean Architecture / Hexagonal (ports & adapters) / Onion**: domain in
  the center, dependencies point inward. The dependency rule is the whole
  game.
- **Modular monolith** first. Microservices only when the monolith's
  coupling or scaling actually hurts — and even then, split by bounded
  context, not by layer.
- Event-driven: event sourcing, saga pattern, outbox pattern (transactional
  outbox with a relay), CQRS when reads and writes diverge.
- Layered vs. vertical slice: vertical slices align with feature teams.

### 2.4 Domain-Driven Design
- Strategic: bounded contexts, ubiquitous language, context mapping
  (anti-corruption layers, shared kernels).
- Tactical: entities, value objects, aggregates, repositories, domain
  services, domain events.
- Event storming for discovery; aggregate design: one transaction per
  aggregate, not per entity.
- DDD is for complex domains. CRUD apps do not need it — do not cargo-cult.

### 2.5 Trade-off literacy
- Every architecture decision is a trade-off; write it down (ADR).
- CAP, consistency models (strong vs. eventual), and what your product
  actually requires.
- Latency vs. consistency vs. cost: know which one you are spending.

---
## 3. Architecture & Design Documentation

### 3.1 C4 model (the default for system diagrams)
- Level 1 Context — system, users, external systems (1 diagram).
- Level 2 Containers — apps, databases, queues, their responsibilities.
- Level 3 Components — modules inside a container.
- Level 4 Code — class diagrams (rarely needed; keep generated).
- Diagrams as code, in version control:
  - Structurizr DSL (best for C4, renders to Mermaid/PlantUML/web).
  - PlantUML (`.puml`, easy in-repo), Mermaid (docs/README friendly).
- Rules: one level per diagram; names+descriptions on every box; no
  technology jargon in level 1; keep diagrams current or delete them.

### 3.2 BPMN 2.0 (process modeling)
- Use for business processes with real branching, parallel flows, and
  handoffs: swimlanes (pools/lanes), events (start/end/intermediate),
  gateways (exclusive `X`, parallel `+`, inclusive), tasks, subprocesses.
- Tools: Camunda 8 (modeler + engine), bpmn-js (embeddable), draw.io.
- Conventions: one start event, clear end states, named gateways with
  conditions, no crossing lines, deadlocks are bugs.
- When BPMN is overkill: linear scripts → flowcharts or plain steps.
- Always pair with the data model: processes consume/produce state.

### 3.3 UML essentials (only what earns its keep)
- Sequence diagrams (interaction contracts, async flows).
- Class diagrams (domain model reviews).
- State machine diagrams (order lifecycle, sagas).
- Skip: use-case diagrams (stakeholder theater), most deployment diagrams.

### 3.4 Documentation discipline
- ADRs (Architecture Decision Records): status, context, decision,
  consequences. One file per decision, numbered, immutable once accepted.
- RFC process for significant changes: short, reviewable, with a decision
  owner.
- README: what/why/how to run in 5 minutes; runbooks in ops docs.
- Docs are code: review them, lint them, keep them truthful.

---
## 4. Methodologies & Process

### 4.1 Version control
- Trunk-based development with short-lived branches (or GitHub Flow).
  Long-lived branches rot; rebase or merge with discipline — pick one
  policy and enforce it.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`,
  `test:`, `perf:`, `ci:` + optional scope; breaking changes marked.
- Semantic Versioning: MAJOR breaking / MINOR feature / PATCH fix;
  breaking changes never ship in a MINOR.
- Atomic commits: one logical change per commit; commit messages explain
  WHY, not what (the diff shows what).
- Protected main branch: required reviews, CI green, no force-push.

### 4.2 Testing methodology
- Test pyramid: many unit, fewer integration, few e2e. Most value per
  dollar sits at the bottom.
- TDD: red-green-refactor for logic-heavy code; the test is the first
  consumer of your API — write it as one.
- BDD (when stakeholders are in the loop): Gherkin features; the
  automation is a bonus, the shared language is the point.
- Test naming: `test_<unit>_<scenario>_<expected>`.
- Never test implementation details; test behavior.

### 4.3 Code review
- Review for: correctness, security, concurrency, data integrity,
  performance, readability, test coverage of the change.
- Author: small PRs (aim < 400 lines), self-review before request,
  describe intent and risk in the description.
- Reviewer: ask questions before demands, cite specifics, no drive-by
  nitpicks on style the linter owns.
- Async review by default; pair review for critical paths.

### 4.4 CI/CD
- CI runs on every PR: lint, type-check, unit tests, build, security scan.
- CD: build once, promote the artifact (immutable builds); never rebuild
  in production.
- Deployment strategies: rolling, blue-green, canary, feature flags
  (flags for risky releases, not long-term conditionals).
- DORA metrics as the audit: deployment frequency, lead time for changes,
  change failure rate, time to restore.

### 4.5 Incident response
- On-call rotations with runbooks; severity taxonomy (SEV1-3) defined in
  advance.
- Blameless postmortems: timeline, impact, root cause (5 whys), action
  items with owners; the system failed, not the person.
- Alert on symptoms, not causes; page humans only when a human decision is
  required.

---
## 5. Linters, Formatters, Static Analysis

("linter use" — the professional baseline)

- **Ruff**: lint + format in one tool. Rules: `E,F` (pyflakes/pycodestyle),
  `I` (isort), `UP` (pyupgrade), `B` (bugbear), `SIM` (simplify),
  `PERF`, `ASYNC` (flake8-async), `ANN` (annotations, start pragmatic).
- **mypy** or **pyright** in strict mode; type-check in CI, not just pre-commit.
- **bandit**: security linter for Python (hardcoded secrets, eval,
  subprocess injection).
- **semgrep**: pattern-based SAST; write custom rules for your
  framework's footguns.
- **safety / pip-audit**: known-vulnerability scan on lockfiles, in CI.
- **pre-commit**: ruff, mypy, format checks, secret detection
  (detect-secrets / gitleaks), end-of-file/trailing-whitespace fixers.
- Complexity gates: radon/wily — flag functions over cyclomatic ~10,
  keep cognitive complexity low; enforce with CI, not vibes.
- Coverage threshold: enforce on changed code (diff coverage), not just
  the whole repo. 80% line coverage is a floor, not a goal.
- EditorConfig + a pinned formatter config in repo = no formatting
  arguments ever again.

---
## 6. Cybersecurity Practices

### 6.1 OWASP Top 10 (2021) — backend mitigations
1. **A01 Broken Access Control**: enforce authorization server-side on
   every endpoint, never trust client claims; deny by default; object-level
   checks (OWASP API1/API5).
2. **A02 Cryptographic Failures**: TLS 1.2+ everywhere, strong hashes
   (argon2id/bcrypt for passwords), no custom crypto, keys in KMS not code.
3. **A03 Injection**: parameterized queries always; ORMs by default, raw
   SQL through a linter (e.g. `no-raw-sql` rules); shell=True never with
   user input; deserialization: allowlists.
4. **A04 Insecure Design**: threat modeling before building; rate limits
   on auth/expensive endpoints; idempotency keys for mutations.
5. **A05 Security Misconfiguration**: no default creds, least-privilege DB
   roles, security headers, debug off in prod, one config path (env).
6. **A06 Vulnerable Components**: lockfiles, Dependabot/Renovate, SBOM,
   pin exact versions, upgrade policy for criticals < 72h.
7. **A07 Identification & Auth Failures**: MFA for privileged, session
   rotation, logout invalidates tokens, brute-force protection.
8. **A08 Software & Data Integrity**: signed artifacts, checksums, CI
   supply-chain controls (no curl|bash from untrusted sources).
9. **A09 Logging & Monitoring Failures**: log auth events, access to
   sensitive data, admin actions; alert on anomalies; logs never contain
   secrets/PII raw.
10. **A10 SSRF**: allowlist outbound hosts, block link-local/metadata
    IPs (169.254.169.254), URL validation with a hardened parser, no
    redirect following to internal targets.

### 6.2 Authentication & Authorization
- **OAuth 2.1 / OIDC**: use a maintained provider library; authorization
  code + PKCE for SPAs; never client-side-only auth.
- **JWT**: short-lived access tokens (15 min), rotation, `aud`/`iss`
  validation, algorithm allowlist (no `none`, no HS256 confusion);
  prefer opaque session tokens when you control the client.
- **RBAC** for roles, **ABAC** for fine-grained (attributes/policies);
  policy decisions centralized (e.g. OPA), not sprinkled.
- Session management: server-side sessions with rotation on privilege
  change; secure+httponly+samesite cookies.
- Secrets: vault/sops/cloud KMS; never in env files committed to git;
  rotation automation; .env in .gitignore with a .env.example.

### 6.3 Secure coding checklist
- Input validation at every boundary (Pydantic schemas; max lengths,
  types, enums).
- CSRF protection for cookie-based sessions (double-submit or same-site
  strict); CORS allowlist, not `*`, for credentialed requests.
- Content-Security-Policy, X-Content-Type-Options, HSTS, Referrer-Policy
  headers in the app or edge.
- Rate limiting per user/IP on auth, mutations, exports; exponential
  backoff on retries.
- File uploads: allowlist extensions + magic-byte check, scan, store
  outside webroot, random names.
- Logs: no secrets, no raw PII; structured redaction.
- Dependency hygiene: `pip-audit` in CI, review transitive deps, minimize
  dependencies (each one is attack surface).

### 6.4 Threat modeling
- STRIDE per component: Spoofing, Tampering, Repudiation, Info disclosure,
  DoS, Elevation of privilege.
- Data flow diagrams first, then threats per flow; use OWASP Threat
  Dragon or pytm.
- Trust boundaries: anything crossing one gets authn/authz + validation.
- Zero-trust posture: verify identity on every request, microsegmentation,
  least privilege, defense in depth — no single control is trusted alone.

---
## 7. Testing

### 7.1 pytest mastery
- Fixtures with `scope` discipline; `tmp_path`, `monkeypatch`,
  `capsys`, `caplog`; parametrize for matrix coverage.
- `unittest.mock`: patch where the name is looked up, prefer dependency
  injection over patching globals.
- Test isolation: no shared state, no network by default (responses /
  respx for HTTP, testcontainers for real services).
- Markers: `unit`, `integration`, `e2e`, `slow`; run fast by default.
- Assertion quality: one behavior per test, descriptive asserts
  (`assert response.status_code == 201` not `assert ok`).

### 7.2 Beyond unit tests
- **Property-based**: hypothesis for parsers, validators, serializers,
  stateful systems.
- **Contract testing**: Pact between services; consumer-driven contracts
  catch breaking changes before deploy.
- **Mutation testing** (mutmut) on critical modules: kills weak tests.
- **Snapshot testing** (syrupy) for serialization changes — use sparingly,
  review diffs.
- E2E (Playwright/Testcontainers) only for critical journeys; keep the
  count low — they are the slowest, flakiest, most expensive layer.
- Load/soak tests (locust, k6) for perf-sensitive endpoints; profile
  before optimizing (measure, then tune, then measure again).

---
## 8. Data & Storage

### 8.1 Relational (SQL) — the default
- Modeling: normalization to 3NF by default, denormalize deliberately
  (read patterns, reporting).
- Constraints: PK/FK, CHECK, NOT NULL, unique — the DB is the last line
  of defense; enforce invariants there.
- Indexing: indexes for query patterns, not for looks; composite index
  column order matters; partial indexes; avoid over-indexing writes.
- ACID + isolation levels (read committed default; serializable when
  correctness demands); transactions short and bounded.
- `EXPLAIN ANALYZE` before and after any query change; watch seq scans
  on hot tables, N+1, and cartesian joins.
- Migrations: Alembic, forward-only, additive by default (expand-migrate-
  contract pattern for zero-downtime); destructive changes in a later
  release, with a script.
- Backups: tested restores are the only real backup.

### 8.2 ORM discipline (SQLAlchemy 2.0)
- Typed `Mapped[...]` models, `select()` statements, avoid the legacy
  Query API.
- N+1: eager loading (`selectinload`/`joinedload`) deliberately, never by
  accident.
- Bulk operations with `insert().execution_options(synchronize_session=False)`.
- Know when to drop to raw SQL (complex reporting, window functions,
  upserts at scale).
- Pydantic at the boundary, ORM models in the data layer — never leak ORM
  objects into API responses (serialization + coupling).

### 8.3 NoSQL & caches — when they actually win
- Document (MongoDB): flexible schemas, denormalized reads.
- Key-value (Redis): caching, rate limiting, distributed locks, queues
  (bullmq/RQ), session store.
- Columnar (ClickHouse/Parquet): analytics, time series.
- Search (OpenSearch/Meilisearch): full-text, faceting.
- Cache patterns: cache-aside with TTL + explicit invalidation, write-
  through for hot writes, stampede protection (locks, jittered TTLs),
  never cache auth decisions.
- Distributed systems basics: idempotency keys on mutations, outbox for
  reliable events, saga for multi-step transactions, retries with
  backoff+jitter, timeouts everywhere.

---
## 9. Concurrency & Performance

- Choose the right primitive: asyncio (I/O-bound), threading (blocking
  I/O with GIL), multiprocessing (CPU-bound), or a compiled extension
  (Cython/Rust) when Python itself is the bottleneck.
- Profile before optimizing: cProfile, py-spy (production, no restart),
  scalene; flamegraphs. Optimize the measured hot path, not the imagined
  one.
- Latency budgets: define p95/p99 targets per endpoint; add observability
  to prove them; backpressure and circuit breakers (tenacity) for
  downstreams.
- DB: connection pooling (SQLAlchemy pool), query plans, batch inserts;
  the DB is the bottleneck 90% of the time.
- Response payloads: pagination (cursor > offset), projection, gzip,
  HTTP caching (ETags, Cache-Control) for read-heavy APIs.
- Startup vs. runtime: lazy imports, `__slots__`, `sys.intern` — only
  when measured.

---
## 10. Observability

- **Logging**: structured JSON (structlog), correlation/request IDs
  propagated across services, log levels with meaning (ERROR = action
  required), never log secrets/PII.
- **Metrics**: Prometheus counters/gauges/histograms; RED (rate, errors,
  duration) for services, USE (utilization, saturation, errors) for
  resources.
- **Tracing**: OpenTelemetry end-to-end; sample generously in dev, budget
  in prod; traces connect logs and metrics via IDs.
- **SLOs/SLIs**: define availability/latency SLOs with error budgets;
  alert on burn rate, not raw thresholds.
- Dashboards are for humans: 5-7 panels per service, don't carpet-bomb.
- Onboarding: a new engineer can answer "is it healthy, and what broke"
  in 10 minutes from your dashboards.

---
## 11. DevOps & Infrastructure

- **Docker**: multi-stage builds (builder + slim runtime), non-root user,
  distroless when possible, healthchecks, `.dockerignore`, pin base
  image digests.
- **Orchestration**: Kubernetes basics (deployments, services, probes,
  HPA); know it well enough to run and debug, not to administer a fleet.
- **IaC**: Terraform for infra, Ansible for config; state in remote
  backend, plan in CI, apply with review; no click-ops.
- **Linux**: systemd units, journalctl, process/socket debugging (ss,
  lsof, strace), filesystem and permissions (the Linux skill domain).
- **Networking**: TCP/HTTP/TLS/DNS mental model, HTTP/2, connection
  pooling, reverse proxies (nginx/Caddy), service discovery.
- **CI runners**: cache dependencies, build once, artifact registry,
  immutable versions.

---
## 12. AI/LLM-Era Engineering (2026 baseline)

> Full playbook: ~/llm-engineering.md (evals-as-CI, RAG, agents, guardrails, cost routing).

- Structured outputs (JSON schemas) instead of parsing prose; function
  calling as the primary interface.
- Guardrails on inputs and outputs: allowlists, PII redaction, prompt
  injection awareness (treat model output as untrusted data).
- Evals as tests: golden sets, regression evals in CI, human review
  loops; a model change is a code change — reviewed and tested.
- RAG when facts matter: chunking, embedding index, retrieval quality
  evals; cite sources in answers.
- Agents: small tools + clear state machines over "let it free-run";
  budget control (token/cost ceilings), timeouts, sandboxing.
- Cost/latency budgets per feature; model routing (cheap model for easy
  tasks) as an engineering decision, not an afterthought.

---
## 13. Master Audit Benchmarks (wave-end checklist)

| Domain | Benchmark / Standard |
|---|---|
| Architecture docs | C4 model complete & current; ADRs for every decision |
| Process modeling | BPMN 2.0 valid; no deadlocks; matches reality |
| Code quality | Ruff clean, mypy strict clean, cyclomatic < 10 |
| Tests | Pyramid balanced, diff coverage >= 80%, CI enforces |
| Security | OWASP Top 10 reviewed per release; SAST+DAST in CI; secrets rotated |
| API design | Richardson Maturity Level 3 where warranted; versioned; idempotent mutations |
| Data | Migrations forward-only; EXPLAIN on hot queries; restores tested |
| Observability | RED/USE metrics live; traces sampled; SLOs with error budgets |
| Delivery | DORA: weekly+ deploys, < 1 day lead time, < 15% change failure, < 1h restore |
| Dependencies | Lockfile, pip-audit clean, no unpatched criticals |
| 12-factor | Config in env, stateless processes, logs as streams, one codebase |
| Quality attributes | ISO/IEC 25010 pass on: performance, security, maintainability, reliability |

## 14. Wave Workflow (how to apply this document)

1. **Plan the wave**: pick the domain(s) above relevant to the task; note
   the audit benchmarks for each.
2. **Iterate**: implement in small, reviewable iterations; lint/type/test
   continuously.
3. **Wave-end audit**: measure against the domain benchmarks; fix gaps
   before proceeding.
4. **Campaign-end audit**: review the system as a whole — cross-domain
   interactions, quality-attribute conflicts, architectural coherence.
5. Record decisions as ADRs; leave the knowledge base better than found.
