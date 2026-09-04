# deploy/

This directory is **illustrative only**. It shows what an ArgoCD-managed
GitOps pipeline — per the platform's existing operating model described in
the assignment brief — would reconcile onto a real cluster for this
service's two deployables. Nothing here is applied or deployed against a
real cluster as part of this submission; there is no ArgoCD `Application`
manifest either, since there's no cluster or repo for it to point at.

- `api-deployment.yaml` — `ConfigMap` + `Deployment` (2 replicas) + `Service`
  + `HorizontalPodAutoscaler` for the HTTP API tier, built from
  `Dockerfile.api`.
- `worker-deployment.yaml` — `ConfigMap` + `Deployment` (1 replica, fixed)
  for the batching worker, built from `Dockerfile.worker`. No `Service` or
  `HorizontalPodAutoscaler` — the worker serves no HTTP traffic and isn't
  autoscaled (see the comment in that file for why single-replica matters
  here, per `docs/system_design.md` section 3c).

Both manifests use a placeholder image reference (`<registry>/...:latest`)
and read non-sensitive config from a `ConfigMap` mirroring `.env.example`,
with the sensitive vars (`DB_PASSWORD`, `WHITELIST_WEBHOOK_SECRET`,
`WHITELIST_GITHUB_TOKEN`) pulled from a `websg-whitelist-secrets` Secret
that is assumed to be provisioned out-of-band (e.g. External Secrets
Operator, sealed-secrets) — no Secret manifest is included here, since even
illustrative fake secret values shouldn't be committed to Git.
