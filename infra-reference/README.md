# infra-reference/

This directory is **illustrative only**. It shows what the target infra
repository's isolated Terraform module (see `docs/system_design.md` section 3d)
would contain — it is not part of the running NestJS service in `src/`, and
nothing in this repository ever runs `terraform apply` against it.

- `ip_whitelist.tfvars.json` — a sample of the generated file the batching
  worker (`src/whitelist/generators/whitelist-tfvars.generator.ts`) produces
  and commits via `GitHubPublisher` (section 3a step 4).
- `main.tf` — a minimal, non-deployable sketch of the isolated Terraform root
  module that would consume that file to manage a single `aws_wafv2_ip_set`
  (section 3d). It has a placeholder state backend and no real AWS credentials, and
  is not a complete module.

The GitHub Actions workflow that would run against this module lives at the
repo root, `.github/workflows/whitelist-apply.yml` — real, functional YAML
shape (trigger, path scoping, plan-guard, webhook callback), just pointed at
this illustrative directory instead of a real infra repo (section 3a step 5).

## `send-webhook.js`

Real, dependency-free script, **not illustrative** — it's the actual script the workflow's "Notify
whitelist service" step runs (via `node send-webhook.js`), and it's also how you manually exercise
the webhook against a running backend without hand-rolling a curl/openssl HMAC signature.

All configuration is via environment variables, all optional:

| Variable | Default | Notes |
| --- | --- | --- |
| `WHITELIST_WEBHOOK_URL` | `http://localhost:3000/api/whitelist/webhooks/terraform-apply` | Must be reachable from wherever the script runs. |
| `WHITELIST_WEBHOOK_SECRET` | `changeme` | Must match the target backend's own `WHITELIST_WEBHOOK_SECRET` exactly, or the call gets `401`. |
| `STATUS` | `success` | `success` or `failure` — anything else exits immediately with an error, before any request is sent. |
| `COMMIT_SHA` | a placeholder sha that matches nothing | Must match the backend's currently-committed sha (e.g. what `NoopPublisher` logs, or a real `GitHubPublisher` commit) to actually move entries to `applied`/`failed` — otherwise it's a harmless `200` no-op. |
| `ERROR` | unset | Optional failure message, only included in the payload when `STATUS=failure`. |

```bash
# Move committed entries to applied — COMMIT_SHA must match a real commit sha
WHITELIST_WEBHOOK_SECRET=changeme COMMIT_SHA=<sha> node send-webhook.js

# Move committed entries to failed, with a reason
WHITELIST_WEBHOOK_SECRET=changeme STATUS=failure ERROR="apply exited 1" COMMIT_SHA=<sha> node send-webhook.js
```

Exits non-zero on a non-2xx response (e.g. `401` for a wrong secret), so it fails a CI step
correctly rather than silently succeeding.
