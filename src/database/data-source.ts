import 'reflect-metadata';
// Must precede createTypeOrmOptions() — it reads process.env directly.
import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { createTypeOrmOptions } from './typeorm-options.js';

/**
 * Standalone DataSource for the TypeORM CLI (migration:run / migration:revert
 * — see package.json and README.md). The running app never imports this file;
 * it uses TypeOrmModule.forRoot(createTypeOrmOptions()) instead.
 */
export const AppDataSource = new DataSource({
  ...(createTypeOrmOptions() as DataSourceOptions),
  migrations: ['src/database/migrations/*.ts'],
});
