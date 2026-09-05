#!/usr/bin/env node
/**
 * Sends an HMAC-signed terraform-apply webhook call — the same logic
 * `.github/workflows/whitelist-apply.yml`'s "Notify whitelist service" step
 * runs in CI (section 3a step 5, section 6), extracted here so it's one
 * real, runnable script instead of two versions of "how to sign a webhook"
 * (inline CI bash vs. ad-hoc manual curl/openssl commands). Run it directly
 * to manually exercise the webhook against a running backend — see
 * README's webhook section.
 *
 * ESM (import, top-level await), not CommonJS — this repo's root
 * package.json sets "type": "module", and since this directory has no
 * package.json of its own, Node resolves module type from that ancestor.
 *
 * WHITELIST_WEBHOOK_SECRET here must match the target backend's own
 * WHITELIST_WEBHOOK_SECRET exactly, or every call gets rejected with 401.
 * In CI, both this and WHITELIST_WEBHOOK_URL come from GitHub Actions repo
 * secrets (see the workflow) — WHITELIST_WEBHOOK_URL must be a URL GitHub's
 * runners can actually reach, which is a real deployment concern this
 * exercise doesn't address (no public deployment — see docs/system_design.md
 * assumption 6).
 *
 * Config via environment variables:
 *   WHITELIST_WEBHOOK_URL     - target URL (default: http://localhost:3000/api/whitelist/webhooks/terraform-apply)
 *   WHITELIST_WEBHOOK_SECRET  - HMAC secret, must match the backend's (default: "changeme")
 *   STATUS                    - "success" or "failure" (default: "success")
 *   COMMIT_SHA                - commit sha the payload reports (default: a placeholder sha)
 *   ERROR                     - optional error message, only sent when STATUS=failure
 *
 * Usage:
 *   node send-webhook.js
 *   STATUS=failure ERROR="apply exited 1" COMMIT_SHA=$(git rev-parse HEAD) node send-webhook.js
 */

import { createHmac } from 'node:crypto';

function readConfig(env) {
  return {
    url:
      env.WHITELIST_WEBHOOK_URL ??
      'http://localhost:3000/api/whitelist/webhooks/terraform-apply',
    secret: env.WHITELIST_WEBHOOK_SECRET ?? 'changeme',
    status: env.STATUS ?? 'success',
    commitSha: env.COMMIT_SHA ?? '0000000000000000000000000000000000000000',
    error: env.ERROR,
  };
}

function buildPayload({ status, commitSha, error }) {
  return {
    status,
    commitSha,
    ...(status === 'failure' && error ? { error } : {}),
  };
}

function signBody(body, secret) {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

const config = readConfig(process.env);

if (config.status !== 'success' && config.status !== 'failure') {
  console.error(`STATUS must be "success" or "failure", got: ${config.status}`);
  process.exit(1);
}

const body = JSON.stringify(buildPayload(config));
const signature = signBody(body, config.secret);

console.log('--- Request ---');
console.log('URL:      ', config.url);
console.log('Body:     ', body);
console.log('----------------\n');

const response = await fetch(config.url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Hub-Signature-256': signature,
  },
  body,
});

console.log(`Status: ${response.status} ${response.statusText}`);
console.log(await response.text());

if (!response.ok) {
  process.exit(1);
}
