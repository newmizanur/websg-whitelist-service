import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { configFactories, databaseConfig } from '../config/index.js';
import { validate } from '../config/environment-variables.js';
import { createTypeOrmOptions } from '../database/typeorm-options.js';
import { WhitelistModule } from '../whitelist/whitelist.module.js';

/**
 * BatchPublisherService and its WHITELIST_PUBLISHER dependency come from
 * WhitelistModule's exports, not redeclared here — Nest instantiates every
 * provider in an imported module's graph regardless of who else injects it,
 * and @nestjs/schedule discovers @Interval() methods across the whole app,
 * so importing WhitelistModule is sufficient to pick up the batching job.
 * WhitelistModule's HTTP-only pieces (controllers, the tenant-auth guard)
 * are simply inert here since this process never mounts an HTTP adapter.
 *
 * ConfigModule.forRoot's `load` list here must match AppModule's exactly —
 * WhitelistModule's providers (e.g. the WEBHOOK_SECRET_TOKEN factory) are
 * instantiated in this process too, and need every namespaced config token
 * registered regardless of whether this process's own code reads it.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: configFactories,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: createTypeOrmOptions,
    }),
    WhitelistModule,
  ],
})
export class WorkerModule {}
