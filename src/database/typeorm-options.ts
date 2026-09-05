import type { ConfigType } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type databaseConfig from '../config/database.config.js';
import { WhitelistEntry } from '../whitelist/entities/whitelist-entry.entity.js';
import { WhitelistPublicationState } from '../whitelist/entities/whitelist-publication-state.entity.js';

/**
 * Shared Postgres connection config for both running processes (the HTTP API
 * in AppModule and the standalone batching worker in WorkerModule) — each
 * wires this via TypeOrmModule.forRootAsync({ inject: [databaseConfig.KEY],
 * useFactory: createTypeOrmOptions }) exactly once, per process.
 */
export function createTypeOrmOptions(
  config: ConfigType<typeof databaseConfig>,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.name,
    entities: [WhitelistEntry, WhitelistPublicationState],
    synchronize: false,
  };
}
