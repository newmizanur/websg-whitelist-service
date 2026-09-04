import { describe, expect, it } from 'vitest';
import {
  SWAGGER_ENABLED_ENV_VAR,
  resolveSwaggerEnabled,
} from './swagger.config.js';

describe('resolveSwaggerEnabled', () => {
  it('defaults to enabled when NODE_ENV is not production and the var is unset', () => {
    expect(resolveSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(resolveSwaggerEnabled({})).toBe(true);
  });

  it('defaults to disabled when NODE_ENV is production and the var is unset', () => {
    expect(resolveSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('forces enabled in production when explicitly set to true', () => {
    expect(
      resolveSwaggerEnabled({
        NODE_ENV: 'production',
        [SWAGGER_ENABLED_ENV_VAR]: 'true',
      }),
    ).toBe(true);
  });

  it('forces disabled outside production when explicitly set to false', () => {
    expect(
      resolveSwaggerEnabled({
        NODE_ENV: 'development',
        [SWAGGER_ENABLED_ENV_VAR]: 'false',
      }),
    ).toBe(false);
  });

  it('falls back to the NODE_ENV-based default for an unrecognized value', () => {
    expect(
      resolveSwaggerEnabled({
        NODE_ENV: 'production',
        [SWAGGER_ENABLED_ENV_VAR]: 'yes',
      }),
    ).toBe(false);
  });
});
