export const SWAGGER_ENABLED_ENV_VAR = 'WHITELIST_SWAGGER_ENABLED';

/**
 * Whether to mount /api/docs. Defaults to enabled everywhere except
 * NODE_ENV=production (the docs expose internal shape, including the
 * webhook contract, that shouldn't be publicly browsable there) — but that
 * default can be overridden explicitly either way via the env var, e.g. to
 * turn it on for a specific production-labeled environment (docker compose)
 * without changing NODE_ENV itself.
 */
export function resolveSwaggerEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[SWAGGER_ENABLED_ENV_VAR];
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return env.NODE_ENV !== 'production';
}
