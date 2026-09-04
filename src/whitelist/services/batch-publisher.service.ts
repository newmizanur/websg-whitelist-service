import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { In, Repository } from 'typeorm';
import {
  ACTIVE_WHITELIST_ENTRY_STATUSES,
  WhitelistEntry,
  WhitelistEntryStatus,
} from '../entities/whitelist-entry.entity.js';
import {
  WHITELIST_PUBLICATION_STATE_ID,
  WhitelistPublicationState,
} from '../entities/whitelist-publication-state.entity.js';
import { generateWhitelistTfvarsContent } from '../generators/whitelist-tfvars.generator.js';
import type { WhitelistPublisher } from '../publishers/whitelist-publisher.js';
import { WHITELIST_PUBLISHER } from '../publishers/whitelist-publisher.token.js';
import { BATCH_INTERVAL_MS } from '../../worker/worker.config.js';

@Injectable()
export class BatchPublisherService {
  private readonly logger = new Logger(BatchPublisherService.name);

  constructor(
    @InjectRepository(WhitelistEntry)
    private readonly whitelistEntryRepository: Repository<WhitelistEntry>,
    @InjectRepository(WhitelistPublicationState)
    private readonly publicationStateRepository: Repository<WhitelistPublicationState>,
    @Inject(WHITELIST_PUBLISHER)
    private readonly publisher: WhitelistPublisher,
  ) {}

  /**
   * Runs as the single scheduled job of a standalone, single-replica worker
   * process (src/worker.ts) — that's what makes it safe to skip a distributed
   * lock / concurrent-run guard here (section 3c): there is never more than one
   * instance of this interval running at once.
   */
  @Interval(BATCH_INTERVAL_MS)
  async run(): Promise<void> {
    const activeEntries = await this.whitelistEntryRepository.find({
      where: { status: In(ACTIVE_WHITELIST_ENTRY_STATUSES) },
    });

    const content = generateWhitelistTfvarsContent(activeEntries);
    const contentHash = hashContent(content);

    const queuedIds = activeEntries
      .filter((entry) => entry.status === WhitelistEntryStatus.QUEUED)
      .map((entry) => entry.id);

    const lastState = await this.publicationStateRepository.findOne({
      where: { id: WHITELIST_PUBLICATION_STATE_ID },
    });

    if (lastState?.contentHash === contentHash) {
      // Nothing new to publish, but a queued row's ip can already be covered
      // by this (unchanged) content — e.g. another tenant re-adds an ip that
      // "earliest attribution wins" dedup was already crediting to someone
      // else. Promote it without a redundant commit, or it would stay
      // queued forever: every future tick keeps hitting this same no-op.
      if (queuedIds.length > 0) {
        await this.whitelistEntryRepository.update(queuedIds, {
          status: WhitelistEntryStatus.COMMITTED,
        });
      }
      return;
    }

    let commitSha: string;
    try {
      ({ commitSha } = await this.publisher.publish(content));
    } catch (error) {
      this.logger.error(
        `Failed to publish whitelist update: ${(error as Error).message}`,
      );
      return;
    }

    if (queuedIds.length > 0) {
      await this.whitelistEntryRepository.update(queuedIds, {
        status: WhitelistEntryStatus.COMMITTED,
      });
    }

    await this.publicationStateRepository.save({
      id: WHITELIST_PUBLICATION_STATE_ID,
      contentHash,
      commitSha,
      publishedAt: new Date(),
    });
  }
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
