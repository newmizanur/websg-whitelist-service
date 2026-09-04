// Must be the first import: several of our config modules (e.g.
// whitelist.config.ts) read process.env at module-load time, so .env has to
// be loaded before anything else in the import graph evaluates.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { AppModule } from './app.module.js';
import { resolveSwaggerEnabled } from './swagger.config.js';

async function bootstrap() {
  // rawBody is required by WebhookSignatureGuard (section 6) to verify GitHub's
  // HMAC signature over the exact bytes received, not a re-serialized body.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  if (resolveSwaggerEnabled()) {
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

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
