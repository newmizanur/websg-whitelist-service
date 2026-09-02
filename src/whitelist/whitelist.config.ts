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
