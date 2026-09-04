import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { WhitelistEntry } from '../whitelist/entities/whitelist-entry.entity.js';
import { WhitelistPublicationState } from '../whitelist/entities/whitelist-publication-state.entity.js';

/**
 * Shared Postgres connection config for both running processes (the HTTP API
 * in AppModule and the standalone batching worker in WorkerModule) — each
 * calls TypeOrmModule.forRoot() with this exactly once, per process.
 */
export function createTypeOrmOptions(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'websg_whitelist',
    entities: [WhitelistEntry, WhitelistPublicationState],
    synchronize: false,
  };
}
