import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
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
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(createTypeOrmOptions()),
    WhitelistModule,
  ],
})
export class WorkerModule {}
