import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StubTenantAuthGuard } from './auth/stub-tenant-auth.guard.js';
import { IpAddressesController } from './controllers/ip-addresses.controller.js';
import { WhitelistEntry } from './entities/whitelist-entry.entity.js';
import { WhitelistPublicationState } from './entities/whitelist-publication-state.entity.js';
import { createWhitelistPublisher } from './publishers/whitelist-publisher.factory.js';
import { WHITELIST_PUBLISHER } from './publishers/whitelist-publisher.token.js';
import { BatchPublisherService } from './services/batch-publisher.service.js';
import { IpAddressesService } from './services/ip-addresses.service.js';
import { TerraformApplyModule } from './webhooks/terraform-apply.module.js';

/**
 * Assembles the whole whitelist feature — tenant-facing API, the batching
 * worker's provider, and the terraform-apply webhook sub-module — behind one
 * import. Exports what a standalone process (the worker, src/worker.ts) needs
 * without also needing to know about this module's HTTP-only pieces
 * (controllers, the tenant-auth guard) or the webhook's own concerns.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WhitelistEntry, WhitelistPublicationState]),
    TerraformApplyModule,
  ],
  controllers: [IpAddressesController],
  providers: [
    IpAddressesService,
    BatchPublisherService,
    StubTenantAuthGuard,
    {
      provide: WHITELIST_PUBLISHER,
      useFactory: () => createWhitelistPublisher(),
    },
  ],
  exports: [TypeOrmModule, BatchPublisherService, WHITELIST_PUBLISHER],
})
export class WhitelistModule {}
