# WebSG Custom — Self-Service IP Whitelist Portal (Backend)

Tenants currently file service requests to add or remove IPs from a shared AWS WAF whitelist that
gates access to the CMS, which puts every change through the platform team. This service replaces
that with a self-service API: tenants submit add/remove requests, the backend validates and queues
them, and a scheduled worker batches queued changes into a single Git commit against the
Terraform-managed whitelist source, so the update still flows through the platform's existing
Terraform + GitOps + code-review model rather than bypassing it. See
[`docs/system_design.md`](docs/system_design.md) for the full design — the options considered, the
GitOps flow end to end, and the auth/validation/blast-radius decisions — this README doesn't repeat
that, only points at it.

## Local setup

```bash
cp .env.example .env        # fill in WHITELIST_WEBHOOK_SECRET at minimum
```

No real infra repo to point at (e.g. you're just reviewing this submission)? Leave
`WHITELIST_GITHUB_OWNER`/`REPO`/`TOKEN` unset — the worker automatically falls back to
`NoopPublisher` (`src/whitelist/publishers/noop.publisher.ts`), which logs the generated
`ip_whitelist.tfvars.json` content instead of committing it. This applies to either path below.

Then pick **one** of the two paths — don't run both, since that starts the batching worker twice,
which is exactly the concurrent-run race that `docs/system_design.md`
[section 3c](docs/system_design.md#3c-batching-commits) relies on single-replica deployment to
avoid.

### Path A: Docker Compose (everything containerized)

```bash
docker compose up -d   # builds/starts Postgres, runs migrations, starts the API and worker
```

Postgres, the one-off migration container, the API (`localhost:3000`), and the worker are all
running after this one command — `docker-compose.yml` chains them via `depends_on`. Watch the
worker's output (e.g. the `NoopPublisher` fallback above) with:

```bash
docker compose logs -f worker
```

`Dockerfile.api`'s runtime stage sets `NODE_ENV=production`, so Swagger UI (`/api/docs`) is off by
default here — set `WHITELIST_SWAGGER_ENABLED=true` in `.env` before `docker compose up -d` if you
want it reachable in this path.

### Path B: Host processes (Postgres only in Docker)

Code changes take effect on restart without an image rebuild, since the API and worker run
directly via `pnpm` instead of the images built from `Dockerfile.api`/`Dockerfile.worker`.

```bash
pnpm install
docker compose up -d postgres   # just Postgres — not migrate/api/worker
pnpm migration:run               # applies src/database/migrations/*.ts
```

Run the two processes separately — the API and the batching worker are independent deployables:

```bash
pnpm start          # HTTP API (src/main.ts)
pnpm start:worker   # batching worker, no HTTP server (src/worker.ts)
```

`NODE_ENV` isn't set to `production` here, so Swagger UI is reachable at
[`localhost:3000/api/docs`](http://localhost:3000/api/docs) by default — no `.env` flag needed.

### Tests

Needs `pnpm install` and a migrated, reachable Postgres — `docker compose up -d postgres && pnpm
migration:run` is enough; the e2e suite truncates its own tables between tests but doesn't run
migrations itself:

```bash
pnpm test        # unit/integration tests (vitest)
pnpm test:e2e    # e2e tests (supertest against a real Nest app instance)
pnpm test:cov    # with coverage
```

To roll back the latest migration: `pnpm migration:revert`.

`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm build`, `pnpm test`, and `pnpm test:e2e` (against a
Postgres service container, migrated the same way) on every push and pull request.

## Design Highlights

`docs/system_design.md` is the original design document — the *why* (problem framing, options
considered and rejected, assumptions, the testing plan, the bonus answers) — kept as a record of
that thinking rather than rewritten to track implementation drift. This README is the
implementation-facing reference: setup, the API surface as actually built, and what's actually
tested. A few sections worth jumping to directly for the deeper reasoning:

- [Section 3 — Why commit-to-Git over direct WAF SDK calls](./docs/system_design.md#3-core-decision-how-updates-reach-aws-waf)
- [Section 3d — Isolating Terraform state to limit blast radius](./docs/system_design.md#3d-blast-radius-risk-shared-terraform-apply-scope)
- [Section 4 — Multi-tenant shared-IP handling](./docs/system_design.md#4-auth--validation)
- [Section 6 — What's automated vs. manually verified vs. out of scope](./docs/system_design.md#6-testing-plan)
- [Sections 7 and 8 — Bonus: tenant-specific whitelists & additional config](./docs/system_design.md#7-bonus-future-tenant-specific-whitelists)

Two reference-artifact directories back the "operable within an AWS environment" requirement with
real (but illustrative, never applied) shape rather than just prose:

- [`deploy/`](deploy/README.md) — Kubernetes manifests (Deployment + Service +
  HorizontalPodAutoscaler) for this service's own API and worker processes, in the platform's
  existing EKS + ArgoCD model.
- [`infra-reference/`](infra-reference/README.md) — the isolated Terraform module and a generated
  `tfvars` sample for the WAF `IPSet` change itself (section 3d).

The Assumptions and Bonus sections below are deliberately condensed pointers into the design doc,
not copies — for the two things most likely to be asked about directly without opening both files.

## Assumptions

Condensed from [`docs/system_design.md` section 2](docs/system_design.md#2-assumptions):

- The whitelist is currently a single **shared** AWS WAF `IPSet`, referenced by a WAF rule in front
  of the CMS ALB/CloudFront.
- Infra changes flow through **Terraform + Git + GitOps**, per the platform's existing operating
  model.
- Tenant identity is established upstream (portal auth, e.g. Cognito/OIDC); the backend receives a
  verified tenant ID via JWT. **This repo stubs that** — see [Testing boundary](#testing-boundary).
- Today's whitelist has no tenant attribution (flat list); tenant-specific whitelists are a future
  bonus item (section 7), not current scope.
- Update frequency is low-to-moderate, so seconds-to-minutes of GitOps propagation latency is
  acceptable.
- No production AWS access — this is code + a documented mechanism, not deployed infra.
- The backend exposes a webhook receiver that GitHub Actions calls after `terraform apply`
  completes, rather than polling CI status.

## API contract

Interactive docs are served at `/api/docs` (Swagger UI) whenever enabled — on by default outside
`NODE_ENV=production`, overridable either way via `WHITELIST_SWAGGER_ENABLED` (see `.env.example`).

The two tenant-facing endpoints below require a tenant identity — see
[Testing boundary](#testing-boundary) for how that's stubbed today. The webhook endpoint further
down uses a completely different auth mechanism (HMAC signature, no tenant identity at all).

### `POST /api/whitelist/ip-addresses`

```
POST /api/whitelist/ip-addresses
x-tenant-id: tenant_123
Content-Type: application/json

{
  "add": ["8.8.8.8", "1.1.1.0/24"],
  "remove": ["8.8.4.4"]
}
```

```
202 Accepted

{
  "requestId": "wl_3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "queued",
  "statusUrl": "/api/whitelist/requests/wl_3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

### `GET /api/whitelist/requests/:id`

```
GET /api/whitelist/requests/wl_3fa85f64-5717-4562-b3fc-2c963f66afa6
x-tenant-id: tenant_123
```

```
200 OK

{
  "requestId": "wl_3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "pending",
  "submittedBy": "tenant_123",
  "entries": [
    { "ip": "8.8.8.8/32", "action": "add", "status": "queued" },
    { "ip": "1.1.1.0/24", "action": "add", "status": "committed" },
    { "ip": "8.8.4.4/32", "action": "remove", "status": "removed from your account" }
  ]
}
```

`404` if the id doesn't exist or belongs to another tenant.

### `POST /api/whitelist/webhooks/terraform-apply` (internal)

Not tenant-facing — called by `.github/workflows/whitelist-apply.yml` after `terraform apply`
completes (`docs/system_design.md` section 3a step 5, section 6). Requires a valid
`X-Hub-Signature-256` HMAC-SHA256 signature computed over the raw request body with
`WHITELIST_WEBHOOK_SECRET`; anything else is rejected with `401` before the payload is read.

```
POST /api/whitelist/webhooks/terraform-apply
X-Hub-Signature-256: sha256=...
Content-Type: application/json

{
  "status": "success",
  "commitSha": "3fa85f6457174562b3fc2c963f66afa6b3fc2c9"
}
```

```
200 OK

{ "status": "ok" }
```

Always `200` — including a no-op on an unrecognized or already-processed `commitSha` — so GitHub
doesn't retry. `status: "failure"` moves the covering commit's rows to `failed` instead, logging the
optional `error` field if present.

### Status values

Each entry and the request as a whole use different, smaller status vocabularies — the same word
("applied") means different things at each level, so here's the explicit mapping:

| Entry status (`entries[].status` for an `add`) | Meaning |
| --- | --- |
| `queued` | Accepted, waiting for the next batch cycle. |
| `committed` | Included in a Git commit the worker pushed; `terraform apply` hasn't confirmed yet. |
| `applied` | Confirmed live in AWS WAF — the webhook reported success for the covering commit. |
| `failed` | The covering commit's `terraform apply` failed. |

A `remove` entry's `status` is one of two human-readable phrases instead: `"removed from your
account"` once your own attribution is gone, or `"still active - held by another tenant"` if the IP
remains whitelisted because another tenant also holds it (section 4).

| Aggregate status (top-level `status`) | Rolls up from |
| --- | --- |
| `pending` | Any entry still `queued` or `committed`. |
| `applied` | Every entry has settled — `applied`, or a `remove` that resolved either way. |
| `failed` | Any entry `failed`. |

Bare addresses are normalized to `/32` (IPv4) or `/128` (IPv6) before being stored or reported back,
since AWS WAFv2 requires CIDR notation for every `IPSet` entry — you can submit either form, but
`GET` responses always show the normalized one.

A CIDR range you submit must already be in canonical form — the network address with all host bits
zeroed for that prefix length (`1.1.1.0/24` is valid, `1.1.1.1/24` is not, since `.1` isn't the
network address of that `/24`). AWS WAFv2 requires canonical form, and non-canonical input is
**rejected**, not auto-corrected — the error names the canonical form to resubmit, e.g. `1.1.1.1/24
is invalid; did you mean 1.1.1.0/24?`. A `/32` or `/128` is always canonical, since the host bits
are the entire address.

## Testing boundary

What's automated (unit and integration tests, no real DB/network — see `CLAUDE.md`):

- IP/CIDR validation (valid/invalid, private/reserved-range rejection, dedup, size limits).
- Entity/migration structure (via TypeORM metadata, no live DB).
- The tfvars generator: dedup across tenants, sort stability, shared-IP removal semantics.
- `GitHubPublisher` and `NoopPublisher`, with the GitHub Contents API fully mocked at the `fetch`
  layer — no real network calls.
- The batching worker's decision logic (no-op when unchanged, single batch covers multiple queued
  changes, failure leaves rows queued, and a queued row is still promoted to committed even when
  content is otherwise unchanged because its IP is already covered by the current publish) —
  repositories mocked.
- The webhook receiver: HMAC signature verification (valid/invalid/missing, and specifically that
  verification uses the raw body, not a re-serialized one), the success/failure status transitions,
  no-op on an unknown commit, and idempotency on a duplicate delivery.
- The tenant-facing add/remove service and controller: successful add/remove, remove never touching
  another tenant's row, max-entries and duplicate rejection, and the `GET` status responses.

What's manually verified (not part of the automated suite):

- The actual end-to-end lifecycle against a real Postgres: `docker compose up` → migrate → start
  API + worker → `POST` an add → confirm the row is `queued` → a worker cycle logs the generated
  JSON via `NoopPublisher` and moves the row to `committed` → a manually-signed webhook call moves
  it to `applied` → `GET` confirms it.

Explicitly out of scope, per [`docs/system_design.md` section 6](docs/system_design.md#6-testing-plan):

- The actual `terraform apply` and resulting AWS WAF `IPSet` mutation. LocalStack's free tier
  doesn't support WAFv2 (`wafv2:CreateIPSet`/`UpdateIPSet` require LocalStack Pro), so it isn't used
  here. `.github/workflows/whitelist-apply.yml` and `infra-reference/` are reference artifacts
  (real shape, illustrative content) — not exercised in CI, since doing so would need real AWS
  credentials.
- Real JWT verification. `src/whitelist/auth/stub-tenant-auth.guard.ts` trusts an `x-tenant-id`
  header outright, standing in for the JWT middleware section 4 assumes already exists upstream — it's
  clearly marked as a temporary stub in its own docstring and must be replaced before production.
- Distributed locking for the batching worker. It runs as a single-replica standalone process
  (`src/worker.ts`); section 3c's concurrent-run guard is deliberately omitted rather than built, since
  single-replica deployment is what makes that safe here.

## Bonus

### Future: tenant-specific whitelists

Adapted from [`docs/system_design.md` section 7](docs/system_design.md#7-bonus-future-tenant-specific-whitelists):

- Move from one shared WAF `IPSet` to **per-tenant `IPSet`s**, each referenced by a tenant-scoped WAF
  rule (or rule group), selected via the `Host` header / tenant routing already present at the
  ALB/CloudFront layer.
- Terraform-side, the whitelist source becomes a map keyed by tenant ID
  (`ip_whitelists = { tenant_123 = [...], tenant_456 = [...] }`), generated into per-tenant `IPSet`
  resources — same GitOps flow, same generator/publisher pattern this repo already implements, just
  parameterized by tenant.
- Migration path: seed each tenant's new `IPSet` from the current shared list, then cut traffic over
  rule-by-rule to avoid a lockout window.

### Additional self-service config: HPA target

Adapted from [`docs/system_design.md` section 8](docs/system_design.md#8-bonus-one-additional-self-service-config):

The **HPA target** (min/max replicas or CPU threshold) for a tenant's website/CMS instance — it's
already called out as something that currently requires a service request, tenants have the
clearest signal on their own traffic patterns, and it's a bounded, low-risk value to hand over
(unlike, say, resource limits, which could affect cluster-wide scheduling). Same shape of problem as
the IP whitelist: high request volume, low risk, well-suited to self-service — the same
validate → queue → batch → GitOps-apply → webhook-confirm pattern this repo builds for the
whitelist would carry over directly.
