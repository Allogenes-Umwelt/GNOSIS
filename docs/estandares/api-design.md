---
id: api-design
title: API Design & the Frontend Contract
version: 1.2.1
status: active
owner: CLARENT
audience: ALLOGENES
domain: [api, http, rest, contracts, backend]
activation:
  triggers:
    - "designing, reviewing, or versioning an HTTP API"
    - "deciding a protocol, an error shape, or a pagination scheme"
    - "changing an endpoint other teams or clients depend on"
    - "wiring a browser client to a backend"
  scope: "HTTP API contracts and the backend's obligations to its clients"
  excludes: "service internals, data modelling, frontend implementation"
extends: []
requires: [backend-engineering]
see_also: [frontend-engineering, application-security]
manual_scores:
  density: 13.5
  editions: 5
  scored_by: Fable 5.1
  scored_at: 2026-09-08
  defended_in: reports/audit-v7.md
  fingerprint: aed79e01e23b5b3a4aa56498c09aec8f
updated: 2026-09-08
review_by: 2027-03-08
---

# API Design & the Frontend Contract

The API is the product surface. Everything behind it can be rewritten; the
contract cannot, not without spending someone else's release.

---
## 1. The contract is the artifact
- REST over HTTP by default, described by **OpenAPI 3.2** (2025). The
  document is the contract — not the code, not the wiki.
- Design-first for public and cross-team APIs: write the spec, review it,
  then implement. Pay: a slower first week. Gain: the argument happens
  before the client exists.
- Code-first for internal APIs whose only consumer is you, with the
  generated spec reviewed on every PR. Below that bar the ceremony costs
  more than it returns.
- **Every route is in the spec.** A route that is not is a shadow API, and
  a shadow API is an unauthenticated one waiting to be found (OWASP API9).
  Assert `routes ⊆ spec` in a test, not in a policy.
- **No document is the §1 failure, not an exemption from it.** A service
  with no machine-readable contract cannot be measured against anything
  below, and the honest reading of that is not "not applicable" — it is
  that the section's first requirement is unmet. Generate the document
  from the routes, review it once, and gate the drift from there.

**When not to**: design-first for an endpoint one internal caller will use
next week. Generate the spec from the code and review it on the PR; the
ceremony is for contracts other people plan against.

**How it goes wrong**: an endpoint added for one dashboard, never entered
in the spec, therefore never in the auth matrix test — serving
unauthenticated for two years because nothing enumerates routes and asks.

#### Audit Benchmarks
- Inventory: a machine-readable contract exists and is generated from, or
  checked against, the served routes on every PR (floor); 100% of routes
  present and a test asserts `routes ⊆ spec` (elite). Enforcer: CI test.
- Source of truth: the document is generated or reviewed on every PR that
  changes a route. Enforcer: CI codegen + review.
- Wiki drift: zero routes documented only outside the contract. Enforcer:
  spec lint against the served routes.
- Design-first: every public or cross-team API has a reviewed spec before
  its first implementation commit. Enforcer: review checklist.

---
## 2. Shape
- Resources are nouns; the verb is the HTTP method. Sub-resources express
  ownership (`/orders/{id}/items`).
- An action that is not CRUD gets a resource, not a verb URL: `/refunds`,
  not `POST /orders/{id}/doRefund`. The refund is a thing that exists,
  has state, and can be listed.
- Status codes that carry meaning: 200 / 201 + `Location` / 202 accepted /
  204 no content / 304 not modified / 400 malformed / 401 unauthenticated
  / 403 unauthorized / 404 absent-or-hidden / 409 conflict / 412
  precondition failed / 422 semantically invalid / 429 rate-limited.
  Pick 404 over 403 when existence itself is a secret.
- Pagination: cursor by default — offset drifts under concurrent writes
  and degrades on deep pages. Offset only for small, static collections.
- Filtering, sorting and sparse fields: one convention, documented once,
  applied everywhere.

**When not to**: a resource per non-CRUD action where the action has no
state worth listing. `POST /sessions/{id}/ping` is a verb URL and should
stay one; the rule earns its keep when the thing that happened is a thing
someone will later want to find.

**How it goes wrong**: `POST /orders/{id}/doRefund`, and eighteen months
later nobody can list refunds, filter them, or attach a state machine to
one, because the refund was never a thing — only something that happened.

#### Audit Benchmarks
- Status codes: every endpoint returns from the set the contract
  documents. Enforcer: `schemathesis` in CI.
- Error status: zero 2xx responses carrying an error payload. Enforcer:
  `schemathesis` in CI.
- Pagination: 100% of collection endpoints paginate, cursor by default.
  Enforcer: spec lint.
- Actions: zero verb URLs — every non-CRUD action is a resource.
  Enforcer: spec lint + review.

---
## 3. Errors
- **RFC 9457 Problem Details** (2023, obsoletes 7807) on every error, with
  a stable `type` URI per error class. Clients switch on `type`, never on
  a human-readable string.
- One error shape across the whole surface. A client that needs two
  parsers has two bugs waiting.
- Validation errors name the field and the rule. "Invalid request" costs a
  support ticket.
- Never leak a stack trace, a driver message, or an internal hostname.

**When not to**: a distinct `type` URI for every validation message. One
per error *class* is what clients switch on; per-message granularity is a
taxonomy nobody maintains.

**How it goes wrong**: a client matching on the human-readable `detail`
string because that was all it had, and a copy-editing pass to the error
text taking down every integration that shipped against it.

#### Audit Benchmarks
- Errors: every error carries a stable machine-readable code a client can
  switch on (floor); RFC 9457 with a resolvable `type` URI (elite).
  Enforcer: schema test over the contract's error responses.
- Robustness: fuzzed input yields zero 5xx. Enforcer: `schemathesis` in
  CI.
- Uniformity: one error shape across the surface; a test asserts every
  documented error response validates against it. Enforcer: CI test.
- Leakage: zero stack traces, driver messages or internal hostnames in
  any error body. Enforcer: response scrubber test.

---
## 4. Evolution
- **Evolve, do not version.** Additive changes only: new optional fields,
  new endpoints. Clients ignore what they do not know.
- A breaking change earns a new major path (`/v2`) and a migration window
  — not a silent redefinition of a field.
- Deprecate with `Deprecation` (RFC 9745, 2025) and `Sunset` (RFC 8594)
  at least 90 days ahead, plus a `deprecation` link to the migration note.
- Detect breaks mechanically with `oasdiff` in CI. Reviewers miss removed
  enum values; diff tools do not.

**When not to**: a `/v2` for an additive field. New optional fields are
what evolution means; a major version is for changes that break a client
which ignores what it does not know.

**How it goes wrong**: an enum quietly gains a value, a client's
exhaustive switch has no default branch, and the failure surfaces as a
blank screen in production rather than as a build error.

#### Audit Benchmarks
- Breaking changes: zero unreviewed breaks. Enforcer: `oasdiff` in CI.
- Deprecation window: every break ships `Deprecation` + `Sunset` >= 90
  days before removal. Enforcer: `oasdiff` in CI.
- Additive by default: a new required request field or a removed response
  field fails the build unless it ships under a new major path. Enforcer:
  `oasdiff`.
- Migration: every deprecation carries a `deprecation` link to a
  migration note. Enforcer: spec lint.

---
## 5. Reliability at the edge
- **Idempotency**: every creating `POST` accepts an `Idempotency-Key`
  (IETF httpapi draft — still a draft, cite it as one). Store the key with
  the response and a TTL; a replay returns the original result, it does
  not create a second order.
- Optimistic concurrency: `ETag` + `If-Match` on mutable resources. Lost
  updates are silent and permanent; a 412 is neither.
- Caching: `Cache-Control` and `ETag` on read-heavy endpoints. The
  cheapest request is the one that returns 304.
- Rate limiting: `RateLimit` header fields (IETF draft) and 429 with
  `Retry-After`. Tell the client how to behave and it will.

**When not to**: `Idempotency-Key` on a naturally idempotent PUT. The
mechanism costs a store and a TTL; spend it where a retry would create a
second thing.

**How it goes wrong**: a payment endpoint with no idempotency, a mobile
client on a flaky connection, and a customer charged twice for one order
because the first response never arrived.

#### Audit Benchmarks
- Idempotency: every creating POST honours `Idempotency-Key`, with a
  replay test per endpoint. Enforcer: CI test.
- Concurrency: every mutable resource supports `ETag` + `If-Match`; a
  test asserts a stale write returns 412. Enforcer: CI test.
- Rate limits: 429 responses carry `Retry-After`; limit headers present.
  Enforcer: header test in CI.

---
## 6. Beyond request/response
- Long-running work: 202 plus a status resource the client polls. Never
  hold a connection open for a job.
- Bulk endpoints: pick one semantic — all-or-nothing, or a per-item result
  array — and document which. Partial success that looks like total
  success is a data-corruption bug.
- **Webhooks**: HMAC signature over timestamp *and* body, a replay window,
  retries with backoff, an idempotent receiver, and a test endpoint.
  Without the timestamp in the signature, a replay is trivially valid.
- Real-time: SSE by default — it is one HTTP response and it reconnects
  itself. WebSockets when the client must push. Polling with ETags when
  neither is worth the operational weight.

**When not to**: a status resource for a job that finishes in eighty
milliseconds. 202 and a poll loop costs the client two round trips to
learn what one would have told it; hold the connection and answer.

**How it goes wrong**: a webhook signature computed over the body alone,
so an attacker replays yesterday's valid delivery and the receiver —
which verifies it correctly — processes the order again.

#### Audit Benchmarks
- Long-running work: zero endpoints hold a connection for a job.
  Enforcer: review + timeout test.
- Webhook signatures: 100% of receivers verify an HMAC over timestamp
  *and* body. Enforcer: CI test.
- Webhook replay: every receiver rejects a delivery outside a stated
  window. Enforcer: CI test.
- Webhook idempotency: every receiver processes a repeated delivery once.
  Enforcer: CI test.
- Bulk: every bulk endpoint documents one semantic and a test asserts
  partial success is distinguishable from total success. Enforcer: CI
  test.

---
## 7. Choosing a protocol

| | REST + OpenAPI | GraphQL | gRPC |
|---|---|---|---|
| Client diversity | many, unknown | many, varied shapes | few, known |
| Public exposure | yes | with cost limits | rarely |
| Streaming | SSE bolt-on | subscriptions | native |
| Polyglot codegen | good | good | excellent |
| Cost you pay | over/under-fetching | depth & cost limiting, N+1 by design, persisted queries | browser needs a proxy, opaque to curl |

- GraphQL earns its place when many clients need different shapes of one
  graph. Budget for dataloader, depth limits and persisted queries on day
  one; they are not optional hardening, they are the price of entry.
- gRPC for internal, streaming, or polyglot service-to-service traffic,
  with `buf` lint and breaking-change detection in CI.
- Event contracts get **AsyncAPI 3.0** (2023) and the same review a
  synchronous API gets. An undocumented event is an undocumented API.

**When not to**: AsyncAPI for an event two services exchange inside one
deployment boundary and one team. Document it in the repository that owns
both; the ceremony is for a contract someone else plans against.

**How it goes wrong**: gRPC chosen for a public API, and every integrator
asking for a REST gateway within a month because they cannot curl it.

#### Audit Benchmarks
- Protocol fit: every surface's protocol choice is recorded with the
  reason; GraphQL surfaces ship depth and cost limits from day one.
  Enforcer: ADR + config test.
- Event contracts: 100% of published events documented in AsyncAPI and
  reviewed like a synchronous API. Enforcer: CI + review.
- Internal APIs: protobuf contracts lint clean, and zero unreviewed
  breaking changes to them. Enforcer: a protobuf linter with
  breaking-change detection in CI (`buf`).

---
## 8. The frontend contract
What the backend owes the client. Frontend implementation lives in
`frontend-engineering`, which holds the client's side of this same
contract; these are the backend's obligations, and getting them wrong is a
backend defect.

- **Auth**: browser apps use a BFF. Tokens never reach web storage —
  `__Host-` prefixed, `httpOnly`, `SameSite` cookies issued by the BFF
  (RFC 9700, 2025). An XSS bug should cost you a session, not a refresh
  token.
- CORS: an explicit allowlist. Never `*` on a credentialed route.
- CSRF: required for cookie sessions — double-submit or `SameSite=Strict`
  on sensitive actions.
- **Generated client**: a TypeScript client generated from the spec in CI.
  A breaking API change then fails a build instead of a user.
- Encodings, agreed once: timestamps ISO 8601 in UTC; money as integer
  minor units plus a currency code, never a float; IDs as strings, because
  JavaScript loses integer precision above 2^53.
- One error shape (§3), so the client has one handler.
- Uploads go direct to object storage via presigned URLs. Never proxy
  bytes through the application.
- Feature flags through one config endpoint, so the client does not guess.
- Declare the latency SLO per endpoint in the spec (`x-slo`). An
  undocumented budget is not a budget.

**When not to**: a single internal consumer does not need deprecation
headers, a generated client, or a versioning ceremony. A shared type
package and a conversation are cheaper. Apply this section in full at the
first *external* or *second team* consumer.

**How it goes wrong**: a generated client that stopped being regenerated
when the codegen job was moved behind a manual trigger "to save CI
minutes" — so a removed response field reached users as `undefined`
instead of failing a build, which is the one thing generating it bought.

#### Audit Benchmarks
- Generated client: a typed client is generated from the spec in CI and
  the build fails on a contract change. Enforcer: codegen job.
- Token storage: zero tokens in browser storage; the session is a
  `__Host-` httpOnly cookie. Enforcer: lint rule + ZAP baseline.
- CORS: zero `*` origins on credentialed routes. Enforcer: config test.
- Money: zero floats for money in any response schema. Enforcer: spec
  lint.
- Identifiers: zero numeric IDs in any response schema. Enforcer: spec
  lint.
- Latency: a p99 target declared per endpoint in the spec (floor);
  measured against it in perf CI (elite). Enforcer: spec lint + perf job.
