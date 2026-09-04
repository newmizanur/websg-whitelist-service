import { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { TerraformApplyService } from './terraform-apply.service.js';

const KNOWN_COMMIT_SHA = 'abc1234';

function makePublicationState(commitSha: string): WhitelistPublicationState {
  return {
    id: WHITELIST_PUBLICATION_STATE_ID,
    contentHash: 'hash-does-not-matter-here',
    commitSha,
    publishedAt: new Date('2026-09-01T00:00:00Z'),
  };
}

function makeRepositories(publicationState: WhitelistPublicationState | null) {
  const whitelistEntryRepository = {
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as Repository<WhitelistEntry>;

  const publicationStateRepository = {
    findOne: vi.fn().mockResolvedValue(publicationState),
  } as unknown as Repository<WhitelistPublicationState>;

  return { whitelistEntryRepository, publicationStateRepository };
}

describe('TerraformApplyService', () => {
  let loggerLogSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loggerLogSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  it('moves committed entries to applied on a matching success payload', async () => {
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories(makePublicationState(KNOWN_COMMIT_SHA));
    const service = new TerraformApplyService(
      whitelistEntryRepository,
      publicationStateRepository,
    );
    const payload: TerraformApplyWebhookDto = {
      status: TerraformApplyStatus.SUCCESS,
      commitSha: KNOWN_COMMIT_SHA,
    };

    await service.handle(payload);

    expect(whitelistEntryRepository.update).toHaveBeenCalledWith(
      { status: WhitelistEntryStatus.COMMITTED },
      { status: WhitelistEntryStatus.APPLIED },
    );
  });

  it('moves committed entries to failed on a matching failure payload and logs the reason', async () => {
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories(makePublicationState(KNOWN_COMMIT_SHA));
    const service = new TerraformApplyService(
      whitelistEntryRepository,
      publicationStateRepository,
    );
    const payload: TerraformApplyWebhookDto = {
      status: TerraformApplyStatus.FAILURE,
      commitSha: KNOWN_COMMIT_SHA,
      error: 'terraform apply exited with code 1',
    };

    await service.handle(payload);

    expect(whitelistEntryRepository.update).toHaveBeenCalledWith(
      { status: WhitelistEntryStatus.COMMITTED },
      { status: WhitelistEntryStatus.FAILED },
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('terraform apply exited with code 1'),
    );
  });

  it('does not log an error reason when the failure payload omits one', async () => {
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories(makePublicationState(KNOWN_COMMIT_SHA));
    const service = new TerraformApplyService(
      whitelistEntryRepository,
      publicationStateRepository,
    );
    const payload: TerraformApplyWebhookDto = {
      status: TerraformApplyStatus.FAILURE,
      commitSha: KNOWN_COMMIT_SHA,
    };

    await service.handle(payload);

    expect(whitelistEntryRepository.update).toHaveBeenCalledWith(
      { status: WhitelistEntryStatus.COMMITTED },
      { status: WhitelistEntryStatus.FAILED },
    );
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('no-ops without writing when the commitSha does not match the stored publication state', async () => {
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories(makePublicationState('a-different-sha'));
    const service = new TerraformApplyService(
      whitelistEntryRepository,
      publicationStateRepository,
    );
    const payload: TerraformApplyWebhookDto = {
      status: TerraformApplyStatus.SUCCESS,
      commitSha: KNOWN_COMMIT_SHA,
    };

    await expect(service.handle(payload)).resolves.toBeUndefined();

    expect(whitelistEntryRepository.update).not.toHaveBeenCalled();
    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(KNOWN_COMMIT_SHA),
    );
  });

  it('no-ops without writing when there is no stored publication state at all', async () => {
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories(null);
    const service = new TerraformApplyService(
      whitelistEntryRepository,
      publicationStateRepository,
    );
    const payload: TerraformApplyWebhookDto = {
      status: TerraformApplyStatus.SUCCESS,
      commitSha: KNOWN_COMMIT_SHA,
    };

    await expect(service.handle(payload)).resolves.toBeUndefined();

    expect(whitelistEntryRepository.update).not.toHaveBeenCalled();
  });

  it('is idempotent when the same webhook payload is delivered twice', async () => {
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories(makePublicationState(KNOWN_COMMIT_SHA));
    const service = new TerraformApplyService(
      whitelistEntryRepository,
      publicationStateRepository,
    );
    const payload: TerraformApplyWebhookDto = {
      status: TerraformApplyStatus.SUCCESS,
      commitSha: KNOWN_COMMIT_SHA,
    };

    await expect(service.handle(payload)).resolves.toBeUndefined();
    await expect(service.handle(payload)).resolves.toBeUndefined();

    expect(whitelistEntryRepository.update).toHaveBeenCalledTimes(2);
    expect(whitelistEntryRepository.update).toHaveBeenNthCalledWith(
      1,
      { status: WhitelistEntryStatus.COMMITTED },
      { status: WhitelistEntryStatus.APPLIED },
    );
    expect(whitelistEntryRepository.update).toHaveBeenNthCalledWith(
      2,
      { status: WhitelistEntryStatus.COMMITTED },
      { status: WhitelistEntryStatus.APPLIED },
    );
  });
});
