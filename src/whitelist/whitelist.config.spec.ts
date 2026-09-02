import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_ENTRIES_PER_REQUEST,
  WHITELIST_MAX_ENTRIES_ENV_VAR,
  resolveMaxEntriesPerRequest,
} from './whitelist.config.js';

describe('resolveMaxEntriesPerRequest', () => {
  it('defaults to 50 when the env var is unset', () => {
    expect(resolveMaxEntriesPerRequest({})).toBe(
      DEFAULT_MAX_ENTRIES_PER_REQUEST,
    );
  });

  it('uses the env var value when it is a positive integer', () => {
    expect(
      resolveMaxEntriesPerRequest({ [WHITELIST_MAX_ENTRIES_ENV_VAR]: '25' }),
    ).toBe(25);
  });

  it('falls back to the default when the env var is not a number', () => {
    expect(
      resolveMaxEntriesPerRequest({ [WHITELIST_MAX_ENTRIES_ENV_VAR]: 'abc' }),
    ).toBe(DEFAULT_MAX_ENTRIES_PER_REQUEST);
  });

  it('falls back to the default when the env var is zero or negative', () => {
    expect(
      resolveMaxEntriesPerRequest({ [WHITELIST_MAX_ENTRIES_ENV_VAR]: '0' }),
    ).toBe(DEFAULT_MAX_ENTRIES_PER_REQUEST);
    expect(
      resolveMaxEntriesPerRequest({ [WHITELIST_MAX_ENTRIES_ENV_VAR]: '-5' }),
    ).toBe(DEFAULT_MAX_ENTRIES_PER_REQUEST);
  });

  it('falls back to the default when the env var is not an integer', () => {
    expect(
      resolveMaxEntriesPerRequest({ [WHITELIST_MAX_ENTRIES_ENV_VAR]: '10.5' }),
    ).toBe(DEFAULT_MAX_ENTRIES_PER_REQUEST);
  });
});
