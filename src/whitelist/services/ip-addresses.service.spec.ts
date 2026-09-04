import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { UpdateIpAddressesDto } from '../dto/update-ip-addresses.dto.js';
import {
  WhitelistEntry,
  WhitelistEntryStatus,
} from '../entities/whitelist-entry.entity.js';
import {
  REMOVED_FROM_ACCOUNT,
  STILL_ACTIVE_FOR_ANOTHER_TENANT,
  IpAddressesService,
} from './ip-addresses.service.js';

function makeEntry(
  overrides: Partial<WhitelistEntry> & { tenantId: string; ip: string },
): WhitelistEntry {
  return {
    id: overrides.id ?? 'entry-id',
    tenantId: overrides.tenantId,
    ip: overrides.ip,
    status: overrides.status ?? WhitelistEntryStatus.QUEUED,
    addedAt: overrides.addedAt ?? new Date('2026-09-01T00:00:00Z'),
    requestId: overrides.requestId ?? 'wl_previous',
  };
}

function makeRepository(overrides: Partial<Repository<WhitelistEntry>> = {}) {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as Repository<WhitelistEntry>;
}

function makeDto(add: string[], remove: string[]): UpdateIpAddressesDto {
  return Object.assign(new UpdateIpAddressesDto(), { add, remove });
}

describe('IpAddressesService', () => {
  describe('submit — add', () => {
    it('inserts a new queued entry when the tenant has no existing row for the ip', async () => {
      const repository = makeRepository();
      const service = new IpAddressesService(repository);

      const { requestId } = await service.submit(
        'tenant_123',
        makeDto(['1.1.1.0/24'], []),
      );

      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant_123',
          ip: '1.1.1.0/24',
          status: WhitelistEntryStatus.QUEUED,
          requestId,
        }),
      );
      expect(requestId).toMatch(/^wl_/);
    });

    it('re-queues an existing entry (e.g. previously failed) without touching addedAt', async () => {
      const existing = makeEntry({
        id: 'existing-id',
        tenantId: 'tenant_123',
        ip: '1.1.1.0/24',
        status: WhitelistEntryStatus.FAILED,
      });
      const repository = makeRepository({
        findOne: vi.fn().mockResolvedValue(existing),
      });
      const service = new IpAddressesService(repository);

      await service.submit('tenant_123', makeDto(['1.1.1.0/24'], []));

      expect(repository.insert).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(
        'existing-id',
        expect.objectContaining({ status: WhitelistEntryStatus.QUEUED }),
      );
      const updatePayload = vi.mocked(repository.update).mock
        .calls[0][1] as Record<string, unknown>;
      expect(updatePayload.addedAt).toBeUndefined();
    });

    it('normalizes a bare IPv4 address to /32 before storing it (AWS WAFv2 requires CIDR)', async () => {
      const repository = makeRepository();
      const service = new IpAddressesService(repository);

      await service.submit('tenant_123', makeDto(['8.8.8.8'], []));

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant_123', ip: '8.8.8.8/32' },
      });
      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '8.8.8.8/32' }),
      );
    });

    it('leaves an already-CIDR address unchanged', async () => {
      const repository = makeRepository();
      const service = new IpAddressesService(repository);

      await service.submit('tenant_123', makeDto(['1.1.1.0/24'], []));

      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '1.1.1.0/24' }),
      );
    });

    it('leaves an already-normalized /32 address unchanged (idempotent)', async () => {
      const repository = makeRepository();
      const service = new IpAddressesService(repository);

      await service.submit('tenant_123', makeDto(['8.8.8.8/32'], []));

      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '8.8.8.8/32' }),
      );
    });
  });

  describe('submit — remove', () => {
    it('soft-deletes only the submitting tenant own row for that ip', async () => {
      const existing = makeEntry({
        id: 'own-entry-id',
        tenantId: 'tenant_123',
        ip: '203.0.113.9/32',
        status: WhitelistEntryStatus.APPLIED,
      });
      const repository = makeRepository({
        findOne: vi.fn().mockResolvedValue(existing),
      });
      const service = new IpAddressesService(repository);

      await service.submit('tenant_123', makeDto([], ['203.0.113.9/32']));

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant_123', ip: '203.0.113.9/32' },
      });
      expect(repository.update).toHaveBeenCalledWith(
        'own-entry-id',
        expect.objectContaining({ status: WhitelistEntryStatus.REMOVED }),
      );
    });

    it('no-ops when the tenant has no row for that ip (e.g. it only belongs to another tenant)', async () => {
      const repository = makeRepository({
        findOne: vi.fn().mockResolvedValue(null),
      });
      const service = new IpAddressesService(repository);

      await expect(
        service.submit('tenant_123', makeDto([], ['203.0.113.9/32'])),
      ).resolves.toBeDefined();

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('no-ops when the entry is already removed', async () => {
      const existing = makeEntry({
        id: 'own-entry-id',
        tenantId: 'tenant_123',
        ip: '203.0.113.9/32',
        status: WhitelistEntryStatus.REMOVED,
      });
      const repository = makeRepository({
        findOne: vi.fn().mockResolvedValue(existing),
      });
      const service = new IpAddressesService(repository);

      await service.submit('tenant_123', makeDto([], ['203.0.113.9/32']));

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('normalizes a bare remove request so it matches the normalized stored row (no dedup/matching bug)', async () => {
      const existing = makeEntry({
        id: 'own-entry-id',
        tenantId: 'tenant_123',
        ip: '8.8.8.8/32',
        status: WhitelistEntryStatus.APPLIED,
      });
      const repository = makeRepository({
        findOne: vi.fn().mockResolvedValue(existing),
      });
      const service = new IpAddressesService(repository);

      // Tenant submits the bare address they originally added — it was
      // stored normalized, so the lookup must normalize too or it silently
      // finds nothing and no-ops instead of removing the tenant's own row.
      await service.submit('tenant_123', makeDto([], ['8.8.8.8']));

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant_123', ip: '8.8.8.8/32' },
      });
      expect(repository.update).toHaveBeenCalledWith(
        'own-entry-id',
        expect.objectContaining({ status: WhitelistEntryStatus.REMOVED }),
      );
    });
  });

  describe('getRequestStatus', () => {
    it('returns undefined when no entries match the tenant and requestId', async () => {
      const repository = makeRepository({
        find: vi.fn().mockResolvedValue([]),
      });
      const service = new IpAddressesService(repository);

      const result = await service.getRequestStatus('tenant_123', 'wl_unknown');

      expect(result).toBeUndefined();
    });

    it.each([
      [WhitelistEntryStatus.QUEUED, 'pending'],
      [WhitelistEntryStatus.COMMITTED, 'pending'],
      [WhitelistEntryStatus.APPLIED, 'applied'],
      [WhitelistEntryStatus.FAILED, 'failed'],
    ] as const)(
      'reports overall status %s -> %s for a single add entry',
      async (entryStatus, overallStatus) => {
        const entry = makeEntry({
          tenantId: 'tenant_123',
          ip: '203.0.113.5',
          status: entryStatus,
        });
        const repository = makeRepository({
          find: vi.fn().mockResolvedValue([entry]),
        });
        const service = new IpAddressesService(repository);

        const result = await service.getRequestStatus('tenant_123', 'wl_abc');

        expect(result?.status).toBe(overallStatus);
        expect(result?.entries).toEqual([
          { ip: '203.0.113.5', action: 'add', status: entryStatus },
        ]);
      },
    );

    it('reports a failed overall status if any entry failed, even when others applied', async () => {
      const entries = [
        makeEntry({
          tenantId: 'tenant_123',
          ip: '1.1.1.1',
          status: WhitelistEntryStatus.APPLIED,
        }),
        makeEntry({
          tenantId: 'tenant_123',
          ip: '2.2.2.2',
          status: WhitelistEntryStatus.FAILED,
        }),
      ];
      const repository = makeRepository({
        find: vi.fn().mockResolvedValue(entries),
      });
      const service = new IpAddressesService(repository);

      const result = await service.getRequestStatus('tenant_123', 'wl_abc');

      expect(result?.status).toBe('failed');
    });

    it('reports "removed from your account" for a removed entry no other tenant holds', async () => {
      const entry = makeEntry({
        tenantId: 'tenant_123',
        ip: '203.0.113.9',
        status: WhitelistEntryStatus.REMOVED,
      });
      const repository = makeRepository({
        find: vi.fn().mockResolvedValue([entry]),
        exists: vi.fn().mockResolvedValue(false),
      });
      const service = new IpAddressesService(repository);

      const result = await service.getRequestStatus('tenant_123', 'wl_abc');

      expect(result?.entries).toEqual([
        { ip: '203.0.113.9', action: 'remove', status: REMOVED_FROM_ACCOUNT },
      ]);
      expect(result?.status).toBe('applied');
    });

    it('reports "still active - held by another tenant" when another tenant still holds the ip', async () => {
      const entry = makeEntry({
        tenantId: 'tenant_123',
        ip: '203.0.113.9',
        status: WhitelistEntryStatus.REMOVED,
      });
      const repository = makeRepository({
        find: vi.fn().mockResolvedValue([entry]),
        exists: vi.fn().mockResolvedValue(true),
      });
      const service = new IpAddressesService(repository);

      const result = await service.getRequestStatus('tenant_123', 'wl_abc');

      expect(result?.entries).toEqual([
        {
          ip: '203.0.113.9',
          action: 'remove',
          status: STILL_ACTIVE_FOR_ANOTHER_TENANT,
        },
      ]);
      expect(repository.exists).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ip: '203.0.113.9' }),
        }),
      );
    });
  });
});
