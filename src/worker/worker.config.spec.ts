import { describe, expect, it } from 'vitest';
import {
  BATCH_INTERVAL_MS_ENV_VAR,
  DEFAULT_BATCH_INTERVAL_MS,
  resolveBatchIntervalMs,
} from './worker.config.js';

describe('resolveBatchIntervalMs', () => {
  it('defaults to 30 seconds when the env var is unset', () => {
    expect(resolveBatchIntervalMs({})).toBe(DEFAULT_BATCH_INTERVAL_MS);
  });

  it('uses the env var value when it is a positive integer', () => {
    expect(
      resolveBatchIntervalMs({ [BATCH_INTERVAL_MS_ENV_VAR]: '45000' }),
    ).toBe(45000);
  });

  it('falls back to the default when the env var is not a number', () => {
    expect(resolveBatchIntervalMs({ [BATCH_INTERVAL_MS_ENV_VAR]: 'abc' })).toBe(
      DEFAULT_BATCH_INTERVAL_MS,
    );
  });

  it('falls back to the default when the env var is zero or negative', () => {
    expect(resolveBatchIntervalMs({ [BATCH_INTERVAL_MS_ENV_VAR]: '0' })).toBe(
      DEFAULT_BATCH_INTERVAL_MS,
    );
    expect(
      resolveBatchIntervalMs({ [BATCH_INTERVAL_MS_ENV_VAR]: '-1000' }),
    ).toBe(DEFAULT_BATCH_INTERVAL_MS);
  });

  it('falls back to the default when the env var is not an integer', () => {
    expect(
      resolveBatchIntervalMs({ [BATCH_INTERVAL_MS_ENV_VAR]: '1000.5' }),
    ).toBe(DEFAULT_BATCH_INTERVAL_MS);
  });
});
