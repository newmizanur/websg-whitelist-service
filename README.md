# WebSG Custom — Self-Service IP Whitelist Portal (Backend)

Tenants currently need a service request to add or remove IPs on the shared AWS WAF whitelist that
gates CMS access. This service replaces that: tenants submit add/remove requests, the backend
validates and queues them, and a scheduled worker batches changes into one Git commit against the
Terraform-managed source — so updates still flow through the platform's existing Terraform +
GitOps + review model. Full design rationale (options considered, blast-radius decisions) lives in
[`docs/system_design.md`](docs/system_design.md); this README covers setup and the API as built.

## Local setup

```bash
cp .env.example .env        # fill in WHITELIST_WEBHOOK_SECRET at minimum
```

No infra repo to point at (e.g. just reviewing this submission)? Leave
`WHITELIST_GITHUB_OWNER`/`REPO`/`TOKEN` unset — the worker falls back to `NoopPublisher`
(`src/whitelist/publishers/noop.publisher.ts`), logging the generated `ip_whitelist.tfvars.json`
instead of committing it. Applies to either path below.

Pick **one** path, not both — running two workers at once is the exact concurrent-run race
[section 3c](docs/system_design.md#3c-batching-commits)'s single-replica assumption avoids.

### Path A: Docker Compose (everything containerized)

```bash
docker compose up -d   # builds/starts Postgres, runs migrations, starts the API and worker
```

One command starts Postgres, runs migrations, and starts the API (`localhost:3000`) and worker —
chained via `depends_on`. Watch the worker's output (e.g. the `NoopPublisher` fallback above) with:

```bash
docker compose logs -f worker
```

Swagger UI (`/api/docs`) is off by default here (`Dockerfile.api`'s runtime stage sets
`NODE_ENV=production`) — set `WHITELIST_SWAGGER_ENABLED=true` in `.env` first if you want it.

### Path B: Host processes (Postgres only in Docker)

API and worker run directly via `pnpm`, not the Docker images — restart picks up code changes with
no rebuild.

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

Swagger UI is on by default here (`NODE_ENV` isn't `production`), at
[`localhost:3000/api/docs`](http://localhost:3000/api/docs).

### Tests

Needs `pnpm install` plus a migrated Postgres (`docker compose up -d postgres && pnpm
migration:run`). The e2e suite truncates its own tables between tests but doesn't run migrations:

```bash
pnpm test        # unit/integration tests (vitest)
pnpm test:e2e    # e2e tests (supertest against a real Nest app instance)
pnpm test:cov    # with coverage
```

To roll back the latest migration: `pnpm migration:revert`.

CI (`.github/workflows/ci.yml`) runs lint, build, `test`, and `test:e2e` the same way on every push
and pull request.

## Design Highlights

`docs/system_design.md` is the original design record — problem framing, rejected options,
assumptions, the testing plan, the bonus answers — kept as-is rather than rewritten to track
implementation drift. This README is the implementation-facing reference. Worth jumping to
directly for the deeper reasoning:

- [Section 3 — Why commit-to-Git over direct WAF SDK calls](./docs/system_design.md#3-core-decision-how-updates-reach-aws-waf)
- [Section 3d — Isolating Terraform state to limit blast radius](./docs/system_design.md#3d-blast-radius-risk-shared-terraform-apply-scope)
- [Section 4 — Multi-tenant shared-IP handling](./docs/system_design.md#4-auth--validation)
- [Section 6 — What's automated vs. manually verified vs. out of scope](./docs/system_design.md#6-testing-plan)
- [Sections 7 and 8 — Bonus: tenant-specific whitelists & additional config](./docs/system_design.md#7-bonus-future-tenant-specific-whitelists)

Two reference-only directories back the "operable within an AWS environment" requirement with real
(never-applied) shape rather than just prose:

- [`deploy/`](deploy/README.md) — Kubernetes manifests (Deployment + Service +
  HorizontalPodAutoscaler) for this service's own API and worker processes, in the platform's
  existing EKS + ArgoCD model.
- [`infra-reference/`](infra-reference/README.md) — the isolated Terraform module and a generated
  `tfvars` sample for the WAF `IPSet` change itself (section 3d).

Assumptions and Bonus below are condensed pointers into the design doc, not copies.

## Assumptions

Condensed from [`docs/system_design.md` section 2](docs/system_design.md#2-assumptions):

- The whitelist is currently a single **shared** AWS WAF `IPSet`, referenced by a WAF rule in front
  of the CMS ALB/CloudFront.
- Infra changes flow through **Terraform + Git + GitOps**, per the platform's existing operating
  model.
- Tenant identity comes from upstream portal auth via JWT — **this repo stubs that**, see
  [Testing boundary](#testing-boundary).
- Today's whitelist has no tenant attribution (flat list); tenant-specific whitelists are a future
  bonus item (section 7), not current scope.
- Update frequency is low-to-moderate, so seconds-to-minutes of GitOps propagation latency is
  acceptable.
- No production AWS access — this is code + a documented mechanism, not deployed infra.
- The backend exposes a webhook receiver that GitHub Actions calls after `terraform apply`
  completes, rather than polling CI status.

## API contract

Swagger UI at `/api/docs` is on by default outside `NODE_ENV=production`, overridable via
`WHITELIST_SWAGGER_ENABLED` (see `.env.example`).

The two tenant-facing endpoints below require a tenant identity — stubbed for now, see
[Testing boundary](#testing-boundary). The webhook endpoint uses a completely different mechanism
(HMAC signature, no tenant identity at all).

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

Internal only — called by `.github/workflows/whitelist-apply.yml` after `terraform apply`
(`docs/system_design.md` section 3a step 5). Requires a valid `X-Hub-Signature-256` HMAC-SHA256
signature over the raw request body with `WHITELIST_WEBHOOK_SECRET`; anything else gets `401`
before the payload is read.

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

Always `200` (including a no-op on an unknown or already-processed `commitSha`, so GitHub doesn't
retry). A `"failure"` status moves the covering commit's rows to `failed` and logs the optional
`error` field.

### Status values

Entries and the overall request use separate status vocabularies — the same word ("applied") means
different things at each level:

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

Bare addresses are normalized to `/32` (IPv4) or `/128` (IPv6) on store, since AWS WAFv2 requires
CIDR notation — `GET` responses always show the normalized form.

Submitted CIDR ranges must already be canonical — host bits zeroed for the prefix length
(`1.1.1.0/24` valid, `1.1.1.1/24` not). Non-canonical input is **rejected**, not auto-corrected; the
error names the canonical form, e.g. `1.1.1.1/24 is invalid; did you mean 1.1.1.0/24?`. A `/32` or
`/128` is always canonical.

### Error handling

Every error goes through Nest's default exception filter — a consistent `{ statusCode, message,
error }` shape everywhere. The surface is small (`UnauthorizedException` for auth/signature
failures, `NotFoundException` for unknown/other-tenant requests, plus `ValidationPipe`'s `400`s), so
there's no central error-code registry or custom global exception filter here — deliberately: that
machinery earns its keep once a client needs codes distinct from HTTP status, or the surface is
large enough to drift. Neither applies to five error cases yet.

## Testing boundary

What's automated (unit and integration tests, no real DB/network):

- IP/CIDR validation (valid/invalid, private/reserved-range rejection, dedup, size limits).
- Entity/migration structure (via TypeORM metadata, no live DB).
- The tfvars generator: dedup across tenants, sort stability, shared-IP removal semantics.
- `GitHubPublisher` and `NoopPublisher`, with the GitHub Contents API mocked at the `fetch` layer —
  no real network calls.
- The batching worker's decision logic (no-op when unchanged, one batch covers multiple queued
  changes, failure leaves rows queued, a queued row still promotes to committed when its IP is
  already covered by the current publish) — repositories mocked.
- The webhook receiver: HMAC signature verification (valid/invalid/missing, against the raw body
  rather than a re-serialized one), success/failure status transitions, no-op on an unknown commit,
  and idempotency on a duplicate delivery.
- The tenant-facing add/remove service and controller: successful add/remove, remove never touching
  another tenant's row, max-entries and duplicate rejection, and the `GET` status responses.

What's manually verified (not part of the automated suite):

- The full lifecycle against a real Postgres: `docker compose up` → migrate → start API + worker →
  `POST` an add → row is `queued` → a worker cycle logs the generated JSON via `NoopPublisher` and
  moves it to `committed` → a manually-signed webhook call moves it to `applied` → `GET` confirms it.

Explicitly out of scope, per [`docs/system_design.md` section 6](docs/system_design.md#6-testing-plan):

- The actual `terraform apply` / AWS WAF `IPSet` mutation — LocalStack's free tier doesn't support
  WAFv2, so it's unused here. `.github/workflows/whitelist-apply.yml` and `infra-reference/` are
  reference artifacts only, not exercised in CI (would need real AWS credentials).
- Real JWT verification — `src/whitelist/auth/stub-tenant-auth.guard.ts` trusts an `x-tenant-id`
  header outright, standing in for the JWT middleware section 4 assumes; marked as a temporary stub
  in its own docstring, must be replaced before production.
- Distributed locking for the batching worker — it runs single-replica (`src/worker.ts`), so section
  3c's concurrent-run guard is deliberately omitted rather than built.

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

**HPA target** (min/max replicas or CPU threshold) for a tenant's website/CMS instance — already
called out as needing a service request today, tenants have the clearest signal on their own
traffic, and it's bounded/low-risk (unlike, say, resource limits, which affect cluster-wide
scheduling). Same shape as the IP whitelist — the same validate → queue → batch → GitOps-apply →
webhook-confirm pattern would carry over directly.
