import 'reflect-metadata';
// Must precede the process.env reads below.
import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { createTypeOrmOptions } from './typeorm-options.js';

/**
 * Standalone DataSource for the TypeORM CLI (migration:run / migration:revert
 * — see package.json and README.md), run via `typeorm-ts-node-esm`. This
 * reads process.env directly rather than importing src/config/database.config.ts's
 * registerAs()-wrapped export: @nestjs/config's CJS build doesn't resolve
 * cleanly under ts-node's ESM loader (a "Cannot find module .../shared.utils.js.js"
 * resolution error), so this one CLI-only entrypoint stays independent of the
 * ConfigModule setup the rest of the app uses. The running app never imports
 * this file; it uses TypeOrmModule.forRootAsync() instead.
 */
export const AppDataSource = new DataSource({
  ...(createTypeOrmOptions({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'websg_whitelist',
  }) as DataSourceOptions),
  migrations: ['src/database/migrations/*.ts'],
});
