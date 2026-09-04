import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Not, type Repository } from 'typeorm';
import type { UpdateIpAddressesDto } from '../dto/update-ip-addresses.dto.js';
import {
  ACTIVE_WHITELIST_ENTRY_STATUSES,
  WhitelistEntry,
  WhitelistEntryStatus,
} from '../entities/whitelist-entry.entity.js';
import { normalizeWhitelistIpAddress } from '../validators/is-whitelist-ip-address.validator.js';

export const REMOVED_FROM_ACCOUNT = 'removed from your account';
export const STILL_ACTIVE_FOR_ANOTHER_TENANT =
  'still active - held by another tenant';

export type RequestOverallStatus = 'pending' | 'applied' | 'failed';

export interface SubmitIpAddressesResult {
  requestId: string;
}

export interface EntryStatusDescriptor {
  ip: string;
  action: 'add' | 'remove';
  status:
    | WhitelistEntryStatus
    | typeof REMOVED_FROM_ACCOUNT
    | typeof STILL_ACTIVE_FOR_ANOTHER_TENANT;
}

export interface RequestStatusResult {
  requestId: string;
  status: RequestOverallStatus;
  submittedBy: string;
  entries: EntryStatusDescriptor[];
}

@Injectable()
export class IpAddressesService {
  constructor(
    @InjectRepository(WhitelistEntry)
    private readonly whitelistEntryRepository: Repository<WhitelistEntry>,
  ) {}

  /**
   * add: upserts on (tenantId, ip), always resetting status to QUEUED so a
   * previously-FAILED entry gets retried (section 4). remove: soft-deletes only the
   * caller's own row — scoping every lookup to `{ tenantId, ip }` is what
   * guarantees another tenant's row for the same shared IP is never touched.
   */
  async submit(
    tenantId: string,
    dto: UpdateIpAddressesDto,
  ): Promise<SubmitIpAddressesResult> {
    const requestId = generateRequestId();

    await Promise.all([
      ...dto.add.map((ip) => this.upsertAdd(tenantId, ip, requestId)),
      ...dto.remove.map((ip) => this.softDeleteRemove(tenantId, ip, requestId)),
    ]);

    return { requestId };
  }

  async getRequestStatus(
    tenantId: string,
    requestId: string,
  ): Promise<RequestStatusResult | undefined> {
    const entries = await this.whitelistEntryRepository.find({
      where: { tenantId, requestId },
    });

    if (entries.length === 0) {
      return undefined;
    }

    const entryDescriptors = await Promise.all(
      entries.map((entry) => this.describeEntry(tenantId, entry)),
    );

    return {
      requestId,
      status: aggregateStatus(entries.map((entry) => entry.status)),
      submittedBy: tenantId,
      entries: entryDescriptors,
    };
  }

  private async upsertAdd(
    tenantId: string,
    rawIp: string,
    requestId: string,
  ): Promise<void> {
    // AWS WAFv2 IPSet requires CIDR notation for every entry — normalize
    // here so whitelist_entries.ip (and everything generated from it) never
    // stores a bare address.
    const ip = normalizeWhitelistIpAddress(rawIp);
    const existing = await this.whitelistEntryRepository.findOne({
      where: { tenantId, ip },
    });

    if (existing) {
      await this.whitelistEntryRepository.update(existing.id, {
        status: WhitelistEntryStatus.QUEUED,
        requestId,
      });
      return;
    }

    await this.whitelistEntryRepository.insert({
      tenantId,
      ip,
      status: WhitelistEntryStatus.QUEUED,
      requestId,
      addedAt: new Date(),
    });
  }

  private async softDeleteRemove(
    tenantId: string,
    rawIp: string,
    requestId: string,
  ): Promise<void> {
    // Must normalize the same way as upsertAdd, or a tenant's own
    // un-normalized remove request (e.g. "8.8.8.8") won't match their
    // normalized stored row ("8.8.8.8/32") and silently no-ops instead.
    const ip = normalizeWhitelistIpAddress(rawIp);
    const existing = await this.whitelistEntryRepository.findOne({
      where: { tenantId, ip },
    });

    if (!existing || existing.status === WhitelistEntryStatus.REMOVED) {
      return;
    }

    await this.whitelistEntryRepository.update(existing.id, {
      status: WhitelistEntryStatus.REMOVED,
      requestId,
    });
  }

  private async describeEntry(
    tenantId: string,
    entry: WhitelistEntry,
  ): Promise<EntryStatusDescriptor> {
    if (entry.status !== WhitelistEntryStatus.REMOVED) {
      return { ip: entry.ip, action: 'add', status: entry.status };
    }

    const heldByAnotherTenant = await this.whitelistEntryRepository.exists({
      where: {
        ip: entry.ip,
        tenantId: Not(tenantId),
        status: In(ACTIVE_WHITELIST_ENTRY_STATUSES),
      },
    });

    return {
      ip: entry.ip,
      action: 'remove',
      status: heldByAnotherTenant
        ? STILL_ACTIVE_FOR_ANOTHER_TENANT
        : REMOVED_FROM_ACCOUNT,
    };
  }
}

function generateRequestId(): string {
  return `wl_${randomUUID()}`;
}

function aggregateStatus(
  statuses: WhitelistEntryStatus[],
): RequestOverallStatus {
  if (statuses.includes(WhitelistEntryStatus.FAILED)) {
    return 'failed';
  }
  if (
    statuses.some(
      (status) =>
        status === WhitelistEntryStatus.QUEUED ||
        status === WhitelistEntryStatus.COMMITTED,
    )
  ) {
    return 'pending';
  }
  // Every remaining status here is APPLIED or REMOVED — both settled outcomes.
  return 'applied';
}
