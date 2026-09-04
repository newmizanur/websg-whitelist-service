// Runs before the e2e suite's modules are imported. Sets a fixed webhook
// secret so WebhookSignatureGuard is configured deterministically, without
// pulling in the developer's real .env (which may hold real GitHub
// credentials — CLAUDE.md forbids real network calls to GitHub in tests, so
// this suite never loads that file). DB_* is left unset: createTypeOrmOptions
// defaults (localhost:5432/postgres/postgres/websg_whitelist) already match
// docker-compose's defaults.
process.env.WHITELIST_WEBHOOK_SECRET = 'e2e-test-secret';
