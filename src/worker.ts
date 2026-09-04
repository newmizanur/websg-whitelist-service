// Must be the first import — see the comment in main.ts.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}
await bootstrap();
