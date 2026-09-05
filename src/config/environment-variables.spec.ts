import { describe, expect, it } from 'vitest';
import { validate } from './environment-variables.js';

describe('validate (ConfigModule env schema)', () => {
  it('accepts an empty config, leaving every field undefined for callers to default', () => {
    const result = validate({});

    expect(result.NODE_ENV).toBeUndefined();
    expect(result.PORT).toBeUndefined();
    expect(result.DB_PORT).toBeUndefined();
  });

  it('coerces numeric-looking string env vars to numbers', () => {
    const result = validate({ PORT: '3000', DB_PORT: '5432' });

    expect(result.PORT).toBe(3000);
    expect(result.DB_PORT).toBe(5432);
  });

  it('passes through well-formed string vars unchanged', () => {
    const result = validate({
      DB_HOST: 'postgres',
      WHITELIST_GITHUB_OWNER: 'websg',
    });

    expect(result.DB_HOST).toBe('postgres');
    expect(result.WHITELIST_GITHUB_OWNER).toBe('websg');
  });

  it('throws when PORT is not a valid integer', () => {
    expect(() => validate({ PORT: 'not-a-number' })).toThrow();
  });

  it('throws when PORT is outside the valid port range', () => {
    expect(() => validate({ PORT: '70000' })).toThrow();
    expect(() => validate({ PORT: '0' })).toThrow();
  });

  it('throws when DB_PORT is not a valid integer', () => {
    expect(() => validate({ DB_PORT: 'abc' })).toThrow();
  });

  it('throws when WHITELIST_MAX_ENTRIES_PER_REQUEST is not a positive integer', () => {
    expect(() =>
      validate({ WHITELIST_MAX_ENTRIES_PER_REQUEST: '0' }),
    ).toThrow();
    expect(() =>
      validate({ WHITELIST_MAX_ENTRIES_PER_REQUEST: 'fifty' }),
    ).toThrow();
  });

  it('throws when WHITELIST_BATCH_INTERVAL_MS is not a positive integer', () => {
    expect(() => validate({ WHITELIST_BATCH_INTERVAL_MS: '-1' })).toThrow();
  });

  it('does not reject an unrecognized NODE_ENV value (callers degrade gracefully, not fail-fast)', () => {
    expect(() => validate({ NODE_ENV: 'staging' })).not.toThrow();
  });

  it('does not reject an unrecognized WHITELIST_SWAGGER_ENABLED value (resolveSwaggerEnabled degrades gracefully)', () => {
    expect(() => validate({ WHITELIST_SWAGGER_ENABLED: 'yes' })).not.toThrow();
  });

  it('ignores extraneous env vars unrelated to this app (e.g. PATH, HOME)', () => {
    expect(() =>
      validate({ PATH: '/usr/bin', HOME: '/home/whoever' }),
    ).not.toThrow();
  });
});
