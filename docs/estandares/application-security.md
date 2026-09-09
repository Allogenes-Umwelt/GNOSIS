---
id: application-security
title: Application Security
version: 1.3.1
status: active
owner: CLARENT
audience: ALLOGENES
domain: [security, appsec, backend, threat-modeling]
activation:
  triggers:
    - "reviewing or writing authentication or authorization code"
    - "threat modeling a service or a change to a trust boundary"
    - "responding to a security finding, scan result, or disclosure"
    - "handling secrets, credentials, PII, or third-party data"
  scope: "Application security for backend services, professional to elite"
  excludes: "network and endpoint security, physical, compliance audit"
extends: []
requires: [backend-engineering]
see_also: [frontend-engineering, llm-engineering, api-design]
manual_scores:
  density: 14
  editions: 5
  scored_by: Fable 5.1
  scored_at: 2026-09-08
  defended_in: reports/audit-v7.md
  fingerprint: 523cc35867c8928d9a63c9480e341892
updated: 2026-09-08
review_by: 2027-03-08
---

# Application Security

Everything in `backend-engineering` still applies; this file only goes
deeper. Read it alongside, not instead.

---
## 1. Standards: what to verify against

The Top 10 lists are awareness. **ASVS is the audit.** Use the lists to
know what goes wrong; use ASVS to prove that it does not.

- **OWASP ASVS 5.0** (2025) is the verification standard: 17 chapters
  (V1-V17), three cumulative levels. Level 2 is the floor for anything
  handling user data; Level 3 on V6 Authentication, V7 Session
  Management, V8 Authorization and V11 Cryptography is the elite bar.
  5.0 rebalanced L1 to be reachable, so "we will start next quarter" is no
  longer an argument.
- Each ASVS chapter opens with a documented-decision requirement: record
  *how* a control was applied and *why*, not just that a box is ticked.
- SOC 2 and ISO 27001 are audit frameworks, not engineering standards, and
  they map **to** ASVS controls rather than replacing them. Keep the
  mapping in the repository beside the threat model: an auditor asking
  "how do you know" should be handed a control and the gate that proves
  it, not a policy document.
- **OWASP API Security Top 10 (2023)** is the list that matters most for
  a backend, because the general Top 10 does not capture how APIs fail:
  API1 BOLA (object-level authorization — about 40% of real API attacks),
  API2 broken authentication, API3 BOPLA (property-level, merging the old
  excessive-data-exposure and mass-assignment), API4 unrestricted resource
  consumption, API5 BFLA (function-level), API6 unrestricted access to
  sensitive business flows, API7 SSRF, API8 misconfiguration, API9
  improper inventory management (shadow and zombie APIs), API10 unsafe
  consumption of third-party APIs.
- BOLA and BFLA are answered by the same control: a route x role matrix
  test generated from the router (§2). API9 is answered by the
  `routes ⊆ spec` test in `api-design` §1. API10 is answered
  by treating a partner's response exactly like user input.

**When not to**: ASVS Level 2 across a prototype nobody has shipped. Pick
the chapters your architecture actually exercises, verify those, and write
down which you deferred and why — a bar you cannot fund becomes a bar you
quietly stop applying.

**How it goes wrong**: a team passes Level 1, reports "ASVS compliant" to
a customer, and discovers at the next audit that Level 1 never covered the
authorization logic the product is built on.

#### Audit Benchmarks
- Verification: ASVS 5.0 Level 2 per release (floor); Level 3 on V6
  Authentication, V7 Session, V8 Authorization and V11 Cryptography
  (elite). Enforcer: release checklist mapped to ASVS chapters.
- Documented decisions: every ASVS chapter in scope records how the
  control was applied and why. Enforcer: security review.
- API inventory: zero shadow routes — `routes ⊆ spec` passes (API9).
  Enforcer: CI test.

---
## 2. OWASP Top 10 (2025) — backend mitigations
The 2025 edition reordered the list and added two categories. SSRF is gone
as a separate entry — it folded into A01.

1. **A01 Broken Access Control**: enforce authorization server-side on
   every endpoint; never trust a client claim; deny by default. Object-
   level (BOLA) and function-level (BFLA) checks on every handler. Now
   absorbs **SSRF**, whose mechanism and its DNS-rebinding trap are in
   §4.
2. **A02 Security Misconfiguration**: promoted in 2025. No default creds,
   least-privilege DB roles, security headers, debug off in prod, one
   config path (env), and no permissive CORS on credentialed routes.
3. **A03 Software Supply Chain Failures**: new in 2025, and the category
   with the highest exploit and impact scores in the data. Vulnerable
   components are one part of it, not the whole. The controls are §4.1.
4. **A04 Cryptographic Failures**: TLS 1.3 preferred, 1.2 the floor;
   hybrid post-quantum key exchange (X25519MLKEM768) at the edge where
   supported. Passwords: argon2id at an OWASP-listed parameter set
   (m=19456, t=2, p=1 or stronger); bcrypt only for legacy, work factor
   >= 10. AEAD only (AES-256-GCM, ChaCha20-Poly1305) via `cryptography`.
   No custom crypto; keys in a KMS, never in code. Carry the algorithm and
   key version in config — crypto-agility is what you are buying, and
   NIST's PQC standards (FIPS 203/204/205, 2024) are why you need it.
5. **A05 Injection**: parameterized queries always; ORMs by default, raw
   SQL gated by Ruff `S608` plus a `semgrep` rule for string-built
   queries; `shell=True` never with user input; deserialization by
   allowlist, never `pickle` on anything a user can reach.
6. **A06 Insecure Design**: threat modeling before building; rate limits
   on auth and expensive endpoints; idempotency keys for mutations; abuse
   cases in the backlog next to the user stories.
7. **A07 Authentication Failures**: phishing-resistant MFA (passkeys) for
   privileged accounts, session rotation on privilege change, logout that
   actually invalidates, brute-force protection with backoff.
8. **A08 Software or Data Integrity Failures**: signed artifacts and
   checksums, verified update paths, no `curl | bash` from untrusted
   sources, no unsigned deserialization of application state.
9. **A09 Security Logging & Alerting Failures**: log auth events, access
   to sensitive data, and admin actions; alert on anomalies with a
   runbook; logs never carry secrets or raw PII. Renamed in 2025 —
   *alerting*, not monitoring: a log nobody is paged from is not a control.
10. **A10 Mishandling of Exceptional Conditions**: new in 2025. Fail
    closed, never open. No blanket `except Exception: pass`; no error path
    that skips an authorization check; no stack trace to the client.
    Distinguish an expected domain failure from a bug, and make the
    unexpected one loud.

**When not to**: treating the Top 10 as a checklist to complete. It is a
list of what goes wrong most often, not a specification — a service can
answer all ten and still fail ASVS on the chapter that matters to it.

**How it goes wrong**: a `try/except` around a permissions lookup that
logs and continues, so a database blip turns "cannot determine access"
into "access granted" for as long as the blip lasts.

#### Audit Benchmarks
- Surface: a DAST baseline against staging reports zero high findings per
  release; CSP present and nonce-based. Enforcer: scheduled CI (ZAP or an
  equivalent scanner).
- Injection: zero queries built from anything but a bound parameter or an
  allowlisted identifier. Enforcer: Ruff `S608` + `semgrep` for the
  string-built cases, review for the rest -- a linter sees an f-string,
  not a missing boundary.
- Query interfaces: no unconstrained query interface reachable from a user
  or a model; where one exists, the connection itself is read-only.
  Enforcer: review + a test that a write through it raises.
- Shell: zero `shell=True` with user input. Enforcer: Ruff `S602`,
  `S605`.
- Exceptional conditions (A10): zero blanket `except Exception: pass`.
  Enforcer: Ruff `TRY`, `S110`.
- Fail closed: zero error paths that skip an authorization check.
  Enforcer: review + a test per handler that denies on the error path.

---
## 3. Authentication & Authorization
- **OAuth 2.0/2.1 + OIDC**: use a maintained provider library. Authorization
  code with PKCE always; never client-side-only auth. **RFC 9700** (BCP
  240, 2025) is the security baseline: the implicit grant is out, and the
  resource-owner-password grant *must not* be used — it cannot support
  MFA or passkeys and it trains users to type credentials into anything.
  OAuth 2.1 folds these in and is still a draft; cite it as one.
- Browser apps use the BFF pattern: tokens stay server-side, the browser
  holds a `__Host-` prefixed httpOnly cookie
  (`api-design` §8). An XSS bug should cost a session, not a
  refresh token.
- Sender-constrained tokens — DPoP (RFC 9449, 2023) or mTLS — so a stolen
  bearer token is not enough on its own (elite).
- **Passkeys / WebAuthn** as the MFA default. Phishing-resistant MFA is
  mandatory for privileged accounts; SMS is not MFA, it is a formality.
- **JWT**: short-lived access tokens (15 min), rotation, `aud`/`iss`
  validation, an `alg` allowlist per key (rejects `none`, and the
  algorithm-confusion attack where an RS256 public key is replayed as an
  HS256 secret);
  prefer opaque session tokens when you control the client.
- Refresh-token rotation with **reuse detection**: a replayed refresh
  token means the chain is compromised, so revoke the family. JWKS with
  `kid` rotation; a `jti` and a revocation list, or logout is decorative.

| Model | Engine | Use when |
|---|---|---|
| RBAC | in-app, or the IdP | Roles are coarse and stable |
| ABAC | OPA, Cedar | Decisions depend on attributes and context |
| ReBAC | OpenFGA, SpiceDB (Zanzibar) | "Who can see this document" — permissions follow relationships |

- Centralize the decision, distribute the enforcement. A policy engine
  called from one middleware beats authorization logic sprinkled through
  handlers, because you can enumerate the first and cannot audit the
  second.
- **The route x role matrix is generated from the router, not written by
  hand.** A hand-written list omits the endpoint added last Tuesday, which
  is precisely the one with no authorization check.
- Log every authorization decision, including the denials. Denials are how
  you spot enumeration.
- Sessions: server-side, rotated on privilege change; `__Host-` prefix,
  `Secure`, `HttpOnly`, `SameSite=Lax` by default and `Strict` for
  sensitive actions.
- Secrets: **workload identity** (OIDC federation, SPIFFE) so there is no
  long-lived static credential to steal. Where a static secret is
  unavoidable: a vault or cloud KMS, automated rotation, push protection
  and `gitleaks` on the repo, and a break-glass procedure that is itself
  audited. `.env` in `.gitignore`, with a committed `.env.example`.

**When not to**: a policy engine and ReBAC for an internal tool with two
roles that have not changed in three years. Centralise the decision when
you have decisions to centralise; before that it is one more service to
run and one more place for the answer to be wrong.

**How it goes wrong**: a refresh token in `localStorage` because the SPA
"needed it there", and an XSS in a marketing widget turning one reflected
script into every session the product has issued.

#### Audit Benchmarks
- Authorization: 100% of routes carry an explicit auth dependency or sit
  on a reviewed public allowlist; the generated route x role matrix test
  passes. Enforcer: router-introspection test in CI.
- Token lifetime: access tokens <= 15 min, with refresh rotation and
  reuse detection. Enforcer: auth config under test.
- Token validation: every verification pins an `alg` allowlist per key and
  checks `aud` and `iss`. Enforcer: auth config under test.
- MFA: phishing-resistant (passkeys) on 100% of privileged accounts.
  Enforcer: IdP policy + quarterly access review.
- Secrets: zero in repo, history, or logs. Enforcer: `gitleaks` in
  pre-commit and CI, plus push protection.
- CI credentials: zero static cloud credentials in CI. Enforcer: OIDC
  federation, and no long-lived key in the secret store.
- Decisions logged: 100% of authorization denials logged. Enforcer:
  middleware test.

---
## 4. Secure coding checklist
- Input validation at every boundary: Pydantic schemas with max lengths,
  types, enums, and **`extra="forbid"`** — that setting is the
  mass-assignment (BOPLA) defence, not a style choice.
- Compare secrets with `hmac.compare_digest`, never `==`. Generate them
  with `secrets`, never `random` (Ruff `S311`).
- Never `pickle` or `yaml.load` untrusted input; `defusedxml` for XML.
- Path traversal: `Path(base).resolve()` then `is_relative_to(base)`.
  String prefix checks are bypassable and always have been.
- ReDoS: no user-controlled regex; `google-re2` where patterns must be
  dynamic. Decompression bombs: cap decompressed size, not just upload
  size. Integer/string conversion limits (3.11+) for parsers.
- CSRF protection for cookie-based sessions (double-submit or same-site
  strict); CORS allowlist, not `*`, for credentialed requests.
- Content-Security-Policy (nonce-based, not `unsafe-inline`),
  X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy, COOP
  and CORP — in the app or at the edge, and tested.
- **SSRF**: resolve the hostname first, then check the resulting IP
  against private, link-local (169.254.169.254) and metadata ranges.
  Validating the URL string is not enough — DNS rebinding defeats it.
  Never follow redirects to internal targets. Allowlist outbound hosts.
- Rate limiting per user/IP on auth, mutations, exports; exponential
  backoff on retries.
- File uploads: allowlist extensions + magic-byte check, scan, store
  outside webroot, random names.
- Cryptography: `cryptography` (pyca) only, never a hand-rolled
  primitive. Algorithms, parameters and the crypto-agility argument are in
  §2 under A04, where the OWASP mapping lives.
- Logs: no secrets, no raw PII; structured redaction at the processor, not
  at each call site.

### 4.1 Supply chain (A03:2025)
The category with the highest exploit and impact scores in the 2025 data,
and the one most teams have no control for at all.

- Lockfiles with hashes (`--require-hashes`); `uv lock --check` in CI.
- **Cooldown before adoption**: uv `exclude-newer` at seven days or more.
  Most compromised releases are caught within days, and a week of latency
  costs you nothing.
- SBOM per release (CycloneDX via `syft`); artifacts and images signed
  with `cosign` and **verified at deploy**, not just at build.
- SLSA (v1.2) Build L2 as the floor, L3 for anything that touches
  customer data. L2 means the platform generates and signs provenance;
  L3 adds isolation between builds and inaccessible signing keys.
- GitHub Actions pinned to a commit SHA, not a tag. Tags move. Lint the
  workflows with `zizmor`.
- Trusted publishing (OIDC) rather than a long-lived PyPI token.
- A private index or proxy with an allowlist; typosquat awareness in
  dependency review. Each dependency is attack surface — the cheapest
  supply-chain control is one fewer dependency.

**When not to**: hand-rolling any of this. Every rule above has a library
that has been attacked more thoroughly than your version will be.

**How it goes wrong**: `yaml.load` on an uploaded configuration file,
because the upload was "internal only" — and internal turns out to mean
any authenticated user, including the one who registered this morning.

#### Audit Benchmarks
- Vulnerabilities: criticals patched < 72h (floor); < 24h (elite).
  Enforcer: SCA in CI + SLA dashboard.
- High findings: every high patched within 30 days. Enforcer: SCA in CI +
  SLA dashboard.
- Release gate: zero unpatched criticals at release. Enforcer: SCA gate in
  the release pipeline.
- Supply chain: SLSA Build L2 (floor), L3 for anything touching customer
  data (elite); artifacts and images signed and verified at deploy; SBOM
  per release; Actions SHA-pinned. Enforcer: CI + admission policy.
- Cooldown: dependency `exclude-newer` >= 7 days; lockfile hashes
  required. Enforcer: CI.
- Deserialisation: zero `pickle`/`yaml.load` on untrusted input.
  Enforcer: Ruff `S301`, `S506`.
- Boundary schemas: every boundary schema sets `extra="forbid"`.
  Enforcer: a schema test per boundary.

---
## 5. Threat modeling
- STRIDE per component: Spoofing, Tampering, Repudiation, Information
  disclosure, Denial of service, Elevation of privilege.
- **LINDDUN** for privacy threats, which STRIDE does not cover. If you
  process personal data, STRIDE alone leaves a hole.
- Model-backed features have a threat model of their own, and neither
  STRIDE nor LINDDUN reaches it: `llm-engineering` §6. Prompt injection is
  not a category either framework anticipated.
- Data flow diagrams first, then threats per flow. Attack trees for the
  crown jewels. Tooling: OWASP Threat Dragon or `pytm`.
- Trust boundaries: anything crossing one gets authentication,
  authorization and validation. No exceptions, including "internal" calls.
- **Data classification** drives everything else:

| Class | Encryption | Access | Logging | Retention |
|---|---|---|---|---|
| Public | in transit | open | normal | indefinite |
| Internal | in transit | authenticated | normal | policy |
| Confidential | + at rest | least privilege | access-logged | policy, enforced |
| Restricted (PII, secrets, payment) | + field level | explicit grant, time-boxed | immutable audit log | minimum, erasure on request |

- The threat model lives in the repo next to the code, and is updated in
  the PR that changes a trust boundary — not quarterly, not in a wiki.
- Abuse cases in the backlog beside the user stories.
- A security champion per team; `security.txt` (RFC 9116) and a published
  disclosure policy, so a finder has somewhere to go that is not Twitter.

**When not to**: STRIDE per component on a CRUD service with one trust
boundary. Model the boundary, not the org chart.

**How it goes wrong**: a threat model written in a wiki at launch, never
updated, describing an architecture two rewrites out of date — and read by
an auditor who takes it as current.

#### Audit Benchmarks
- Coverage: a threat model exists per service, updated in the PR that
  changes a trust boundary, reviewed quarterly. Enforcer: PR template +
  CODEOWNERS + calendar.
- Classification: 100% of data stores and columns carry a classification;
  restricted data has field-level encryption and an immutable audit log.
  Enforcer: schema tag audit in CI.
- Disclosure: `security.txt` published and reachable; every report
  acknowledged within 3 business days and triaged within 10. Enforcer:
  uptime check + disclosure inbox SLA.

---
## 6. Security in the pipeline
Every control above is a wish until something runs it.

| Layer | Tool | Gate |
|---|---|---|
| SAST | Ruff `S`, `semgrep` | zero high |
| Dependencies (SCA) | `pip-audit`, `osv-scanner` | zero unpatched critical |
| Secrets | `gitleaks` + push protection | zero, blocking |
| IaC | `checkov`, `trivy config` | zero high |
| Containers | `trivy` | zero critical |
| Pipeline itself | `zizmor`, `actionlint` | clean, SHA-pinned |
| Runtime (DAST) | ZAP baseline vs. staging | zero high per release |

- Findings get an owner and an SLA, not a backlog. An exception carries an
  expiry date and a name; a permanent exception is a decision, and needs
  an ADR.
- Fail the build on new findings, not on the whole backlog — otherwise the
  gate gets disabled in week two.

**When not to**: a DAST baseline as a merge gate. It needs a deployed
environment and minutes to run; schedule it per release and keep the PR
gate to what can answer in seconds.

**How it goes wrong**: exactly that — someone adds `|| true` to unblock a
release, the pipeline stays green for a year, and nobody notices the SCA
job has been reporting nothing since.

#### Audit Benchmarks
- Gates: every layer in the table above runs on every PR; new findings
  fail the build while the existing backlog does not. Enforcer: CI.
- Ownership: 100% of findings have an owner and an SLA. Enforcer:
  security backlog review.
- Exceptions: every accepted risk carries an expiry date and a name.
  Enforcer: security backlog review.
- Pipeline integrity: the pipeline definitions pass a security audit with
  zero high findings, and a syntax lint. Enforcer: CI (`zizmor` and
  `actionlint` on GitHub Actions).
- Step pinning: 100% of third-party steps pinned by immutable reference.
  Enforcer: `zizmor` in CI.
- Job permissions: least-privilege permissions declared on every job.
  Enforcer: `zizmor` in CI.

---
## 7. Privacy & data protection
- Minimisation and purpose limitation: the safest record is the one you
  did not collect.
- Retention as code — a scheduled job with a test, not a policy document.
- DSAR and erasure by design. For immutable stores, crypto-shredding:
  destroy the per-subject key and the data is unrecoverable.
- Encryption in transit and at rest; field-level for restricted data.
- Immutable audit logs for access to restricted data.
- A DPA or zero-retention terms **before** customer data reaches any
  third party, model providers included (`llm-engineering` §9.1).

**When not to**: crypto-shredding a store that has a working delete
path. Destroying the key makes erasure unauditable — you can no longer
prove what was removed — and it is a technique for the stores that cannot
delete, not a default.

**How it goes wrong**: an analytics export bucket nobody set a lifecycle
rule on. The database honours every retention policy and every erasure
request; the parquet files beside it hold the same subjects for four
years, and the first anyone hears of it is a DSAR that cannot be
answered.

#### Audit Benchmarks
- Minimisation: every personal-data field has a stated purpose and a
  retention period. Enforcer: data inventory review.
- Retention: deletion runs on schedule and is tested, not documented.
  Enforcer: scheduled job with an assertion in CI.
- Erasure: a DSAR and an erasure request are both satisfiable end to end,
  drilled annually; crypto-shredding for immutable stores. Enforcer:
  drill + runbook.
- Third parties: a DPA or zero-retention terms in place before any
  customer data leaves, model providers included. Enforcer: vendor review
  gate.
- Logs: zero secrets or raw PII in logs and traces. Enforcer: redaction
  processor + log-scan test.
