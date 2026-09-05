import { describe, expect, it } from 'vitest';
import { resolveSwaggerEnabled } from './swagger.config.js';

describe('resolveSwaggerEnabled', () => {
  it('defaults to enabled when NODE_ENV is not production and the var is unset', () => {
    expect(
      resolveSwaggerEnabled({ nodeEnv: 'development', swaggerEnabledRaw: undefined }),
    ).toBe(true);
    expect(
      resolveSwaggerEnabled({ nodeEnv: undefined, swaggerEnabledRaw: undefined }),
    ).toBe(true);
  });

  it('defaults to disabled when NODE_ENV is production and the var is unset', () => {
    expect(
      resolveSwaggerEnabled({ nodeEnv: 'production', swaggerEnabledRaw: undefined }),
    ).toBe(false);
  });

  it('forces enabled in production when explicitly set to true', () => {
    expect(
      resolveSwaggerEnabled({ nodeEnv: 'production', swaggerEnabledRaw: 'true' }),
    ).toBe(true);
  });

  it('forces disabled outside production when explicitly set to false', () => {
    expect(
      resolveSwaggerEnabled({ nodeEnv: 'development', swaggerEnabledRaw: 'false' }),
    ).toBe(false);
  });

  it('falls back to the NODE_ENV-based default for an unrecognized value', () => {
    expect(
      resolveSwaggerEnabled({ nodeEnv: 'production', swaggerEnabledRaw: 'yes' }),
    ).toBe(false);
  });
});
