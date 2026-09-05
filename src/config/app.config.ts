import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV,
  // Raw tri-state string (undefined | 'true' | 'false' | anything else) —
  // resolveSwaggerEnabled interprets it, including its deliberate
  // any-other-value-degrades-gracefully behavior.
  swaggerEnabledRaw: process.env.WHITELIST_SWAGGER_ENABLED,
}));
