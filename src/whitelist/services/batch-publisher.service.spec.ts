import { Logger } from '@nestjs/common';
import { In, type Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WhitelistEntry,
  WhitelistEntryStatus,
} from '../entities/whitelist-entry.entity.js';
import {
  WHITELIST_PUBLICATION_STATE_ID,
  WhitelistPublicationState,
} from '../entities/whitelist-publication-state.entity.js';
import type { WhitelistPublisher } from '../publishers/whitelist-publisher.js';
import { BatchPublisherService } from './batch-publisher.service.js';

function makeEntry(overrides: {
  id: string;
  ip: string;
  tenantId: string;
  addedAt: Date;
  status: WhitelistEntryStatus;
}): WhitelistEntry {
  return { ...overrides, requestId: 'request-id' };
}

function makeRepositories() {
  const whitelistEntryRepository = {
    find: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as Repository<WhitelistEntry>;

  const publicationStateRepository = {
    findOne: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as Repository<WhitelistPublicationState>;

  return { whitelistEntryRepository, publicationStateRepository };
}

function makeService(
  overrides: {
    whitelistEntryRepository?: Repository<WhitelistEntry>;
    publicationStateRepository?: Repository<WhitelistPublicationState>;
    publisher?: WhitelistPublisher;
  } = {},
) {
  const repos = makeRepositories();
  const publisher: WhitelistPublisher = overrides.publisher ?? {
    publish: vi.fn().mockResolvedValue({ commitSha: 'new-commit-sha' }),
  };

  return new BatchPublisherService(
    overrides.whitelistEntryRepository ?? repos.whitelistEntryRepository,
    overrides.publicationStateRepository ?? repos.publicationStateRepository,
    publisher,
  );
}

describe('BatchPublisherService', () => {
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('queries only active (non-failed) entries', async () => {
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories();
    const service = makeService({
      whitelistEntryRepository,
      publicationStateRepository,
    });

    await service.run();

    expect(whitelistEntryRepository.find).toHaveBeenCalledWith({
      where: {
        status: In([
          WhitelistEntryStatus.QUEUED,
          WhitelistEntryStatus.COMMITTED,
          WhitelistEntryStatus.APPLIED,
        ]),
      },
    });
  });

  it('is a no-op when the desired state matches the last published state', async () => {
    const entry = makeEntry({
      id: 'entry-1',
      ip: '203.0.113.5',
      tenantId: 'tenant_123',
      addedAt: new Date('2026-09-01T00:00:00Z'),
      status: WhitelistEntryStatus.APPLIED,
    });
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories();
    vi.mocked(whitelistEntryRepository.find).mockResolvedValue([entry]);

    // Precompute the hash the same way the service does, by running once
    // against an empty prior state, then feeding that hash back as "already
    // published" for the no-op assertion below.
    const bootstrapPublisher: WhitelistPublisher = {
      publish: vi.fn().mockResolvedValue({ commitSha: 'sha-1' }),
    };
    let savedState: { contentHash: string } | undefined;
    vi.mocked(publicationStateRepository.save).mockImplementation(
      async (state: unknown) => {
        savedState = state as { contentHash: string };
        return state as WhitelistPublicationState;
      },
    );
    const bootstrapService = makeService({
      whitelistEntryRepository,
      publicationStateRepository,
      publisher: bootstrapPublisher,
    });
    await bootstrapService.run();

    vi.mocked(publicationStateRepository.findOne).mockResolvedValue({
      id: WHITELIST_PUBLICATION_STATE_ID,
      contentHash: savedState!.contentHash,
      commitSha: 'sha-1',
      publishedAt: new Date(),
    });

    const publisher: WhitelistPublisher = { publish: vi.fn() };
    const service = makeService({
      whitelistEntryRepository,
      publicationStateRepository,
      publisher,
    });

    await service.run();

    expect(publisher.publish).not.toHaveBeenCalled();
    expect(whitelistEntryRepository.update).not.toHaveBeenCalled();
  });

  it('promotes a queued entry to committed even when the content hash is unchanged, e.g. its ip is already covered by the currently-published state (regression: was stuck queued forever)', async () => {
    const appliedEntry = makeEntry({
      id: 'entry-1',
      ip: '203.0.113.5',
      tenantId: 'tenant_123',
      addedAt: new Date('2026-09-01T00:00:00Z'),
      status: WhitelistEntryStatus.APPLIED,
    });
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories();
    vi.mocked(whitelistEntryRepository.find).mockResolvedValue([appliedEntry]);

    const bootstrapPublisher: WhitelistPublisher = {
      publish: vi.fn().mockResolvedValue({ commitSha: 'sha-1' }),
    };
    let savedState: { contentHash: string } | undefined;
    vi.mocked(publicationStateRepository.save).mockImplementation(
      async (state: unknown) => {
        savedState = state as { contentHash: string };
        return state as WhitelistPublicationState;
      },
    );
    const bootstrapService = makeService({
      whitelistEntryRepository,
      publicationStateRepository,
      publisher: bootstrapPublisher,
    });
    await bootstrapService.run();

    vi.mocked(publicationStateRepository.findOne).mockResolvedValue({
      id: WHITELIST_PUBLICATION_STATE_ID,
      contentHash: savedState!.contentHash,
      commitSha: 'sha-1',
      publishedAt: new Date(),
    });

    // A second tenant re-queues the same ip after it's already live. The
    // "earliest attribution wins" dedup keeps entry-1's metadata, so the
    // generated content — and therefore its hash — is unchanged even though
    // there's a brand new queued row.
    const queuedEntry = makeEntry({
      id: 'entry-2',
      ip: '203.0.113.5',
      tenantId: 'tenant_456',
      addedAt: new Date('2026-09-02T00:00:00Z'),
      status: WhitelistEntryStatus.QUEUED,
    });
    vi.mocked(whitelistEntryRepository.find).mockResolvedValue([
      appliedEntry,
      queuedEntry,
    ]);

    const publisher: WhitelistPublisher = { publish: vi.fn() };
    const service = makeService({
      whitelistEntryRepository,
      publicationStateRepository,
      publisher,
    });

    await service.run();

    expect(publisher.publish).not.toHaveBeenCalled();
    expect(whitelistEntryRepository.update).toHaveBeenCalledWith(['entry-2'], {
      status: WhitelistEntryStatus.COMMITTED,
    });
  });

  it('publishes once and commits every queued entry in a single batch', async () => {
    const entries = [
      makeEntry({
        id: 'entry-1',
        ip: '203.0.113.5',
        tenantId: 'tenant_123',
        addedAt: new Date('2026-09-01T00:00:00Z'),
        status: WhitelistEntryStatus.QUEUED,
      }),
      makeEntry({
        id: 'entry-2',
        ip: '198.51.100.0/24',
        tenantId: 'tenant_456',
        addedAt: new Date('2026-09-02T00:00:00Z'),
        status: WhitelistEntryStatus.QUEUED,
      }),
      makeEntry({
        id: 'entry-3',
        ip: '8.8.8.8',
        tenantId: 'tenant_789',
        addedAt: new Date('2026-08-01T00:00:00Z'),
        status: WhitelistEntryStatus.APPLIED,
      }),
    ];
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories();
    vi.mocked(whitelistEntryRepository.find).mockResolvedValue(entries);
    const publisher: WhitelistPublisher = {
      publish: vi.fn().mockResolvedValue({ commitSha: 'new-commit-sha' }),
    };
    const service = makeService({
      whitelistEntryRepository,
      publicationStateRepository,
      publisher,
    });

    await service.run();

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    const publishedContent = vi.mocked(publisher.publish).mock.calls[0][0];
    expect(publishedContent).toContain('203.0.113.5');
    expect(publishedContent).toContain('198.51.100.0/24');
    expect(publishedContent).toContain('8.8.8.8');

    expect(whitelistEntryRepository.update).toHaveBeenCalledTimes(1);
    expect(whitelistEntryRepository.update).toHaveBeenCalledWith(
      ['entry-1', 'entry-2'],
      {
        status: WhitelistEntryStatus.COMMITTED,
      },
    );

    expect(publicationStateRepository.save).toHaveBeenCalledTimes(1);
    const savedState = vi.mocked(publicationStateRepository.save).mock
      .calls[0][0] as {
      id: string;
      commitSha: string;
    };
    expect(savedState.id).toBe(WHITELIST_PUBLICATION_STATE_ID);
    expect(savedState.commitSha).toBe('new-commit-sha');
  });

  it('leaves entries queued and does not record new state when publishing fails', async () => {
    const entry = makeEntry({
      id: 'entry-1',
      ip: '203.0.113.5',
      tenantId: 'tenant_123',
      addedAt: new Date('2026-09-01T00:00:00Z'),
      status: WhitelistEntryStatus.QUEUED,
    });
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories();
    vi.mocked(whitelistEntryRepository.find).mockResolvedValue([entry]);
    const publisher: WhitelistPublisher = {
      publish: vi.fn().mockRejectedValue(new Error('GitHub API unavailable')),
    };
    const service = makeService({
      whitelistEntryRepository,
      publicationStateRepository,
      publisher,
    });

    await expect(service.run()).resolves.toBeUndefined();

    expect(whitelistEntryRepository.update).not.toHaveBeenCalled();
    expect(publicationStateRepository.save).not.toHaveBeenCalled();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('GitHub API unavailable'),
    );
  });

  it('does not call update when there are no queued entries to commit', async () => {
    const entry = makeEntry({
      id: 'entry-1',
      ip: '203.0.113.5',
      tenantId: 'tenant_123',
      addedAt: new Date('2026-09-01T00:00:00Z'),
      status: WhitelistEntryStatus.APPLIED,
    });
    const { whitelistEntryRepository, publicationStateRepository } =
      makeRepositories();
    vi.mocked(whitelistEntryRepository.find).mockResolvedValue([entry]);
    const publisher: WhitelistPublisher = {
      publish: vi.fn().mockResolvedValue({ commitSha: 'new-commit-sha' }),
    };
    const service = makeService({
      whitelistEntryRepository,
      publicationStateRepository,
      publisher,
    });

    await service.run();

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(whitelistEntryRepository.update).not.toHaveBeenCalled();
    expect(publicationStateRepository.save).toHaveBeenCalledTimes(1);
  });
});
