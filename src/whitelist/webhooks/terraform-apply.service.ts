import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  WhitelistEntry,
  WhitelistEntryStatus,
} from '../entities/whitelist-entry.entity.js';
import {
  WHITELIST_PUBLICATION_STATE_ID,
  WhitelistPublicationState,
} from '../entities/whitelist-publication-state.entity.js';
import {
  TerraformApplyStatus,
  type TerraformApplyWebhookDto,
} from './terraform-apply.dto.js';

@Injectable()
export class TerraformApplyService {
  private readonly logger = new Logger(TerraformApplyService.name);

  constructor(
    @InjectRepository(WhitelistEntry)
    private readonly whitelistEntryRepository: Repository<WhitelistEntry>,
    @InjectRepository(WhitelistPublicationState)
    private readonly publicationStateRepository: Repository<WhitelistPublicationState>,
  ) {}

  /**
   * Individual entries don't record their own commit — only the singleton
   * publication-state row does (section 3a step 7). So a webhook is only actionable
   * when its commitSha matches that row: every currently-COMMITTED entry is
   * then, by construction, part of that same commit. A stale/duplicate
   * webhook (unknown commitSha, or one already fully applied/failed so no
   * COMMITTED rows remain) simply matches nothing and safely no-ops — GitHub
   * gets 200 either way so it doesn't retry (section 3a step 7, section 6).
   */
  async handle(payload: TerraformApplyWebhookDto): Promise<void> {
    const publicationState = await this.publicationStateRepository.findOne({
      where: { id: WHITELIST_PUBLICATION_STATE_ID },
    });

    if (publicationState?.commitSha !== payload.commitSha) {
      this.logger.log(
        `Ignoring terraform-apply webhook for unknown/stale commit ${payload.commitSha}`,
      );
      return;
    }

    if (payload.status === TerraformApplyStatus.FAILURE && payload.error) {
      this.logger.error(
        `Terraform apply failed for commit ${payload.commitSha}: ${payload.error}`,
      );
    }

    const newStatus =
      payload.status === TerraformApplyStatus.SUCCESS
        ? WhitelistEntryStatus.APPLIED
        : WhitelistEntryStatus.FAILED;

    await this.whitelistEntryRepository.update(
      { status: WhitelistEntryStatus.COMMITTED },
      { status: newStatus },
    );
  }
}
