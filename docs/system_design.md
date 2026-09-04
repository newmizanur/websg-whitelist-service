# WebSG Custom — Self-Service IP Whitelist Portal (Backend)

## 1. Problem Recap

Tenants currently file service requests to add/remove IPs from a shared AWS WAF whitelist that
gates access to the CMS. Goal: expose a self-service API so tenants manage their own IPs, cutting
operational load on the platform team.

## System Overview

Components at a glance — the terraform-apply webhook's return path (Actions back to the API) is
omitted here for a compact layout; see the sequence diagram below for that detail:

```mermaid
flowchart TD
    Tenant(["Tenant / Portal"])
    API[NestJS API]
    DB[(Postgres)]
    Worker["Batching Worker<br/>single-replica"]
    Infra[(GitHub infra repo)]
    Actions["GitHub Actions<br/>terraform plan/apply"]
    WAF[AWS WAFv2 IPSet]

    Tenant --> API --> DB
    Worker --> DB
    Worker --> Infra --> Actions --> WAF
```

The same flow, with the request/response and async webhook detail this time:

```mermaid
sequenceDiagram
    actor Tenant
    participant API as NestJS API
    participant DB as Postgres
    participant Worker as Batching Worker
    participant Infra as GitHub infra repo
    participant Actions as GitHub Actions
    participant WAF as AWS WAFv2 IPSet

    Tenant->>API: POST /api/whitelist/ip-addresses
    API->>DB: validate, upsert queued row
    API-->>Tenant: 202 Accepted (status: queued)

    loop every 30-60s
        Worker->>DB: poll active entries
        Worker->>Worker: generate tfvars, diff content hash
        alt content changed
            Worker->>Infra: commit ip_whitelist.tfvars.json
            Worker->>DB: mark queued rows committed
        end
    end

    Infra->>Actions: push triggers terraform plan/apply
    Actions->>WAF: apply
    Actions->>API: HMAC-signed webhook (status, commitSha)
    API->>DB: mark covering rows applied/failed

    Tenant->>API: GET /api/whitelist/requests/:id
    API-->>Tenant: status per entry
```

The backend never calls AWS directly (see the direct-SDK option rejected in section 3) — every
change flows through Git so it stays inside the platform's existing Terraform + review model.

## 2. Assumptions

| # | Assumption | Rationale / Impact |
|---|---|---|
| 1 | Whitelist is currently a single **shared** AWS WAF `IPSet`, referenced by a WAF rule in front of the CMS ALB/CloudFront. | Matches "shared set of whitelisted IP addresses...used by all tenants" in the brief. |
| 2 | Infra changes normally flow through **Terraform + Git + GitOps (ArgoCD)**, per the platform's stated operating model. | Drives the core design decision below — this is the one path consistent with the platform's existing conventions. |
| 3 | Tenant identity is already established upstream (portal auth — e.g., Cognito/OIDC) and the backend receives a verified tenant ID via JWT. | Out of scope to build auth from scratch; API just needs to *enforce* it. |
| 4 | Today's whitelist has no tenant attribution (flat list) — tenant-specific whitelists are a **future** bonus item, not current scope. | Keeps MVP API tenant-agnostic on the WAF side but tenant-scoped on the request/audit side (see section 6). |
| 5 | Update frequency is low-to-moderate (human-driven, not high-QPS), so a few seconds to minutes of propagation latency via GitOps is acceptable. | Justifies choosing correctness/auditability over raw speed. |
| 6 | No production AWS access — solution is code + documented mechanism, not deployed infra. | Per assignment note. |
| 7 | Internal backend exposes a **webhook receiver** that GitHub Actions calls after `terraform apply` completes (success/failure + commit SHA), rather than the backend polling CI status. Concrete for this exercise, `terraform apply` is triggered via **GitHub Actions**. | Gives a testable contract (backend-owned endpoint) instead of an unspecified polling loop. CI tool choice remains swappable in principle; GitHub Actions is what I implemented against. |

## 3. Core Decision: How Updates Reach AWS WAF

Two viable mechanisms — chose one, documented the trade-off:

### Option A — Direct SDK call (`wafv2:UpdateIPSet`)
- Backend calls AWS directly on each tenant request.
- ✅ Simple, low latency (seconds).
- ❌ Bypasses Terraform state → **drift**: next `terraform plan` may revert tenant changes or show a permanent diff. Breaks the platform's own IaC/audit story.

### Option B — GitOps-native (chosen)
- Backend validates the request, then **commits a change** to the Terraform-managed IP set
  source file (e.g., `ip_whitelist.tfvars.json`) in the infra repo, on a dedicated branch, and opens
  a PR — or pushes straight to an auto-apply branch.
- **Important correction**: this is a *Terraform* pipeline, not the K8s GitOps/ArgoCD pipeline —
  ArgoCD only reconciles Kubernetes manifests and never touches Terraform-managed AWS resources
  like a WAF `IPSet`. The brief describes two separate flows (K8s via GitOps/ArgoCD, infra via
  Terraform + Git + code review); the whitelist update belongs to the second. See section 3a for the
  concrete push/apply flow.
- ✅ Consistent with platform's existing model, gets change review/audit trail without extra tooling.
- ❌ Slower (propagation = commit → CI → apply, ~1–5 min), more moving parts (Git write access,
  merge/apply automation).

### 3a. Concrete Flow: Backend → DB → Git → Terraform Apply

1. **Backend validates** the tenant's add/remove request (section 4 rules).
2. **Backend writes to its own database** (a `whitelist_entries` table, unique on `(tenant_id,
   ip)`: ip, tenant, addedAt, status) — this is the system's source of truth, not the Git file.
   The write is the atomic point of truth; concurrent requests serialize through the DB, not
   through a Git read-merge-write. Multiple tenants may each hold their own row for the same IP —
   see section 4 shared-IP handling.
3. Respond `202 Accepted` immediately with `status: "queued"` (see section 3c — actual Git push happens
   on a batch cycle, not per-request).
4. **A scheduled worker** picks up queued changes (section 3c), generates the *full* desired
   `ip_whitelist.tfvars.json` content by taking a **`DISTINCT`, sorted union of IPs** across all
   active tenant rows (no need to fetch-and-merge Git content) — dedup happens here, not at
   write-time, since two tenants legitimately holding the same IP is valid at the DB level.
   Sorting keeps output deterministic, so Git diffs only show real changes rather than incidental
   reordering — important for the review/audit trail the GitOps model is meant to provide. Pushed
   via the Git provider's Contents API.
   - Note: the Contents API still needs the file's current `sha` to update it (optimistic
     concurrency control) — that's a cheap metadata read, not a full fetch-then-merge of content.
5. **CI triggers `terraform plan`/`apply`**, scoped to the isolated whitelist module (section 3d).
   - **Assumption, not confirmed**: brief doesn't specify what runs `terraform apply`. Assuming
     GitHub Actions for concreteness; design doesn't depend on which tool it is.
6. **Terraform apply** updates the actual AWS WAF `IPSet` resource.
7. **Status feedback**: backend polls/receives a CI webhook on apply result, updates all DB rows
   covered by that commit to `applied`/`failed`. Tenant polls `GET
   /api/whitelist/requests/:id` for their specific request's status.

### 3c. Batching Commits

Committing on every single tenant request is risky beyond just Git API rate limits: each commit to
`main` risks triggering a **separate `terraform apply`** (section 3d already treats apply as a shared,
stateful operation). N rapid tenant requests → N applies is noisy and increases risk unnecessarily.

- Tenant requests are validated and written to the DB immediately (section 3a step 2), responding `202`
  with `status: "queued"` — no change to the API contract, just a realistic async latency.
- A scheduled worker runs every **30–60s**: if the desired whitelist state has changed since the
  last successful commit, it generates the full JSON from DB and pushes **one commit** covering
  everything queued in that window.
- All DB rows included in that commit move to `committed`, then `applied`/`failed` once CI
  reports back (step 7 above).
- Trade-off: a tenant's change reflects in AWS with up to one batch-window's added latency — batch
  interval is a tunable that trades latency against Git/CI churn.

### 3d. Blast-Radius Risk: Shared `terraform apply` Scope

A real risk with step 3–4 above: if the whitelist commit lands on `main` and CI runs a repo-wide
`terraform apply`, it applies **everything currently merged but not yet applied** — not just the
whitelist diff. A tenant clicking "add IP" could inadvertently ship someone else's in-flight infra
change. Two mitigations, used together:

- **Isolate the whitelist into its own Terraform root module + state file** (e.g.
  `infra/cms-whitelist/`), separate from the rest of the platform infra (clusters, tenant
  provisioning, etc.). CI scopes `plan`/`apply` to that directory/state only, on whitelist-branch
  changes. This is the real fix — it structurally limits blast radius to the WAF `IPSet`, and is
  the standard pattern when one small piece of infra needs a much faster, independent change
  cadence than the rest of the platform.
- **Plan-diff guard as defense in depth**: even with isolated state, parse the `terraform plan`
  JSON output before auto-applying, and abort to human review if the plan touches any resource
  other than the expected `aws_wafv2_ip_set`. Cheap insurance against drift or misconfiguration.

**Decision: Option B**, because the brief explicitly frames the platform's operating model around
Terraform + GitOps + reviewable changes — an API that silently bypasses that would undermine the
exact discipline the platform is built on. Mitigation for the latency trade-off: return `202
Accepted` with a status the tenant can poll (section 5), rather than blocking on WAF propagation.

*(Implementation note: for the take-home code itself, I'll stub the Git-write step behind an
interface — e.g. `WhitelistPublisher` — with a `GitOpsPublisher` implementation that would commit
via the GitHub/GitLab API, and a `NoopPublisher`/logger for local testing, since no real repo
access exists in this exercise.)*

**Note on tenant attribution in the Terraform source:** `.tfvars.json` is plain JSON — no
comments — so tenant attribution can't be inlined as a comment. Instead, use a structured object
keyed by IP, with tenant as metadata Terraform doesn't need to consume:

```json
{
  "cms_whitelist_ips": {
    "203.0.113.5": { "tenant": "tenant_123", "addedAt": "2026-09-02T10:00:00Z" },
    "198.51.100.0/24": { "tenant": "tenant_456", "addedAt": "2026-09-01T08:30:00Z" }
  }
}
```
Terraform extracts `keys(var.cms_whitelist_ips)` for the actual WAF `IPSet` resource; the metadata
rides along in Git/state for traceability. Commit messages and the app-level audit log
(`submittedBy` in sections 5 and 6) are the primary human-readable trail.

## 4. Auth & Validation

- **AuthN**: JWT bearer token (assumed issued by portal's existing auth) — verified via middleware.
  *(Concretely implemented here via a guard that trusts an `x-tenant-id` header outright, standing
  in for real JWT verification — explicitly marked as a temporary stub; see README's Testing
  boundary section.)*
- **AuthZ**: tenant ID extracted from JWT claims; request body cannot specify a different tenant.
  Today's shared whitelist means any authenticated tenant can propose an add/remove, but every
  change is **tagged with the submitting tenant** in an audit log — laying groundwork for section 7.
- **Input validation** (class-validator / zod):
  - Each entry must be valid IPv4/IPv6 or CIDR.
  - Reject private/reserved ranges (RFC1918, loopback, link-local) — prevents whitelisting internal
    ranges by mistake.
  - Dedup entries; enforce a max list size per request (e.g. 50) to bound blast radius of one call.
  - Reject if resulting global IPSet would exceed AWS WAF's IPSet capacity limit.
- **Shared-IP handling (multiple tenants, same IP)**: uniqueness is enforced on `(tenant_id, ip)`,
  not `(ip)` alone — two tenants can each hold their own attributed row for the same IP (common
  with shared corporate NAT/VPN egress ranges). Consequences:
  - `remove` only retracts the **submitting tenant's own attribution**; it never directly deletes
    from the WAF list.
  - An IP leaves the generated WAF list only when its **last remaining active tenant-attribution**
    is removed.
  - Response/status should distinguish "removed from your account" vs. "removed, but IP still
    active because tenant X also holds it" — otherwise a tenant may think their removal silently
    failed.
- **Rate limiting** on the endpoint (per tenant) to prevent abuse/flooding the GitOps pipeline with
  commits.

## 5. API Contract (sketch)

```
POST /api/whitelist/ip-addresses
Authorization: Bearer <jwt>

Body:
{
  "add": ["203.0.113.5", "198.51.100.0/24"],
  "remove": ["203.0.113.9"]
}

202 Accepted
{
  "requestId": "wl_9f2a...",
  "status": "pending",
  "statusUrl": "/api/whitelist/requests/wl_9f2a..."
}

GET /api/whitelist/requests/:id
200 OK
{
  "requestId": "wl_9f2a...",
  "status": "applied" | "pending" | "failed",
  "submittedBy": "tenant_123",
  "submittedAt": "...",
  "appliedAt": "..."
}
```

## 6. Testing Plan

- Unit tests: input validation (valid/invalid IP & CIDR, private-range rejection, dedup, size
  limits), authz (tenant can't spoof another tenant's ID), publisher interface (mock Git call),
  distinct-sorted-union generation logic (section 3a step 4), shared-IP removal semantics (section 4).
- **Webhook receiver**: integration test posting a simulated GitHub Actions payload (`{ status,
  commitSha, ... }`) and asserting the right DB rows transition to `applied`/`failed`, including
  rejecting payloads that fail HMAC signature verification.
- Integration-style test with an in-memory/fake `WhitelistPublisher` to verify the request →
  commit-payload mapping is correct without touching real infra.
- **Out of scope for automated tests / explicit boundary**: the actual `terraform apply` and
  resulting AWS WAF `IPSet` mutation. **LocalStack's free tier does not support WAFv2**
  (`wafv2:CreateIPSet`/`UpdateIPSet` require LocalStack Pro), so it isn't used here. The GitHub
  Actions workflow YAML is included as a reference artifact but isn't exercised in CI for this
  submission, since doing so would need real AWS credentials. For my own confidence before
  submitting, I'd manually verify end-to-end against a throwaway `aws_wafv2_ip_set` in a sandbox
  AWS account — apply, confirm the IPSet's `Addresses` matches the generator's output, tear down —
  but that's a one-off manual smoke check, not something a grader without my AWS credentials could
  reproduce, so it's not part of the automated suite.

## 7. Bonus: Future Tenant-Specific Whitelists

- Move from one shared WAF `IPSet` to **per-tenant `IPSet`s**, each referenced by a tenant-scoped
  WAF rule (or rule group), selected via `Host` header / tenant routing already present at the
  ALB/CloudFront layer.
- Terraform-side: whitelist source becomes a map keyed by tenant ID
  (`ip_whitelists = { tenant_123 = [...], tenant_456 = [...] }`), generated into per-tenant IPSet
  resources — keeps one Terraform-managed source of truth, same GitOps flow, just parameterized.
- Migration path: seed each tenant's new IPSet from the current shared list, then cut traffic over
  rule-by-rule to avoid a lockout window.

## 8. Bonus: One Additional Self-Service Config

**HPA target (min/max replicas or CPU threshold)** for the tenant's website/CMS instance — it's
already called out in the brief as something that currently requires a service request, tenants
have the clearest signal on their own traffic patterns, and it's a bounded, low-risk value (unlike
e.g. resource limits, which could affect cluster-wide scheduling) — same shape of problem as the IP
whitelist: high request volume, low risk, well-suited to self-service.
