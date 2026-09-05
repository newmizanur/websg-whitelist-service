/**
 * Deliberately NOT part of src/config/ (the ConfigModule/registerAs setup
 * used everywhere else — see app.module.ts) — MAX_ENTRIES_PER_REQUEST below
 * feeds `@ArrayMaxSize(MAX_ENTRIES_PER_REQUEST)` in update-ip-addresses.dto.ts,
 * a class-validator decorator argument evaluated when that module loads,
 * before Nest's DI container (and so ConfigService/registerAs tokens) exists.
 * There's no way to inject a runtime value into a decorator argument, so this
 * has to stay a plain process.env read at import time. It's still covered by
 * environment-variables.ts's fail-fast validate() for format-correctness at
 * boot, just not by ConfigService for the actual value used.
 */
export const WHITELIST_MAX_ENTRIES_ENV_VAR =
  'WHITELIST_MAX_ENTRIES_PER_REQUEST';
export const DEFAULT_MAX_ENTRIES_PER_REQUEST = 50;

export function resolveMaxEntriesPerRequest(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[WHITELIST_MAX_ENTRIES_ENV_VAR];
  if (raw === undefined) {
    return DEFAULT_MAX_ENTRIES_PER_REQUEST;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_ENTRIES_PER_REQUEST;
}

export const MAX_ENTRIES_PER_REQUEST = resolveMaxEntriesPerRequest();
