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
- `send-webhook.js` — real, dependency-free script that HMAC-signs and sends the
  terraform-apply webhook payload. Not illustrative — it's the actual script
  `.github/workflows/whitelist-apply.yml`'s "Notify whitelist service" step
  runs, and it's also how you'd manually exercise the webhook against a
  running backend (see README's webhook section).

The GitHub Actions workflow that would run against this module lives at the
repo root, `.github/workflows/whitelist-apply.yml` — real, functional YAML
shape (trigger, path scoping, plan-guard, webhook callback), just pointed at
this illustrative directory instead of a real infra repo (section 3a step 5).
