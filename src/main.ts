// Must be the first import: whitelist.config.ts and worker/worker.config.ts
// read process.env at module-load time (their values feed class-validator
// and @nestjs/schedule decorator arguments, which are evaluated before
// Nest's DI container — and so ConfigModule — exists), so .env has to be
// loaded before anything else in the import graph evaluates. Everything else
// goes through ConfigModule/registerAs instead (see src/config/).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { ConfigType } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { AppModule } from './app.module.js';
import appConfig from './config/app.config.js';
import { resolveSwaggerEnabled } from './swagger.config.js';

async function bootstrap() {
  // rawBody is required by WebhookSignatureGuard (section 6) to verify GitHub's
  // HMAC signature over the exact bytes received, not a re-serialized body.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  if (resolveSwaggerEnabled(config)) {
    const { version } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
    ) as { version: string };

    const swaggerConfig = new DocumentBuilder()
      .setTitle('WebSG Whitelist Service')
      .setDescription(
        'Self-service API for tenants to add/remove their own IPs on the shared CMS WAF ' +
          'whitelist. See docs/system_design.md in the repository for the full design.',
      )
      .setVersion(version)
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.port);
}
await bootstrap();
