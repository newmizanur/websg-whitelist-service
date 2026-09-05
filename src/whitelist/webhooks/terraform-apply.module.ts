import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import webhookConfig from '../../config/webhook.config.js';
import { WhitelistEntry } from '../entities/whitelist-entry.entity.js';
import { WhitelistPublicationState } from '../entities/whitelist-publication-state.entity.js';
import { TerraformApplyController } from './terraform-apply.controller.js';
import { TerraformApplyService } from './terraform-apply.service.js';
import {
  WEBHOOK_SECRET_TOKEN,
  WebhookSignatureGuard,
} from './webhook-signature.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhitelistEntry, WhitelistPublicationState]),
  ],
  controllers: [TerraformApplyController],
  providers: [
    TerraformApplyService,
    WebhookSignatureGuard,
    {
      provide: WEBHOOK_SECRET_TOKEN,
      useFactory: (config: ConfigType<typeof webhookConfig>) => config.secret,
      inject: [webhookConfig.KEY],
    },
  ],
})
export class TerraformApplyModule {}
