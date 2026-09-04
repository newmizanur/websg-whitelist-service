export const BATCH_INTERVAL_MS_ENV_VAR = 'WHITELIST_BATCH_INTERVAL_MS';
export const DEFAULT_BATCH_INTERVAL_MS = 30_000;

export function resolveBatchIntervalMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[BATCH_INTERVAL_MS_ENV_VAR];
  if (raw === undefined) {
    return DEFAULT_BATCH_INTERVAL_MS;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_BATCH_INTERVAL_MS;
}

export const BATCH_INTERVAL_MS = resolveBatchIntervalMs();
