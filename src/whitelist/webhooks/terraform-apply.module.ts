import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhitelistEntry } from '../entities/whitelist-entry.entity.js';
import { WhitelistPublicationState } from '../entities/whitelist-publication-state.entity.js';
import { TerraformApplyController } from './terraform-apply.controller.js';
import { TerraformApplyService } from './terraform-apply.service.js';
import { WebhookSignatureGuard } from './webhook-signature.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhitelistEntry, WhitelistPublicationState]),
  ],
  controllers: [TerraformApplyController],
  providers: [TerraformApplyService, WebhookSignatureGuard],
})
export class TerraformApplyModule {}
