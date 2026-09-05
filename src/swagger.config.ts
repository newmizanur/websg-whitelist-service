import type { ConfigType } from '@nestjs/config';
import type appConfig from './config/app.config.js';

/**
 * Whether to mount /api/docs. Defaults to enabled everywhere except
 * NODE_ENV=production (the docs expose internal shape, including the
 * webhook contract, that shouldn't be publicly browsable there) — but that
 * default can be overridden explicitly either way via WHITELIST_SWAGGER_ENABLED,
 * e.g. to turn it on for a specific production-labeled environment (docker
 * compose) without changing NODE_ENV itself.
 */
export function resolveSwaggerEnabled(
  config: Pick<ConfigType<typeof appConfig>, 'nodeEnv' | 'swaggerEnabledRaw'>,
): boolean {
  if (config.swaggerEnabledRaw === 'true') {
    return true;
  }
  if (config.swaggerEnabledRaw === 'false') {
    return false;
  }
  return config.nodeEnv !== 'production';
}
