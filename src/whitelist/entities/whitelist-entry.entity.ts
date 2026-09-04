import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export enum WhitelistEntryStatus {
  QUEUED = 'queued',
  COMMITTED = 'committed',
  APPLIED = 'applied',
  FAILED = 'failed',
  /** Tenant retracted their own attribution (section 4) — a terminal, soft-deleted state. */
  REMOVED = 'removed',
}

/**
 * Statuses that count as "this tenant currently wants this IP whitelisted" —
 * used both to build the generated tfvars content (section 3a step 4) and to decide
 * whether another tenant still holds a shared IP after one tenant removes it
 * (section 4). REMOVED is deliberately excluded (the tenant retracted it); FAILED is
 * excluded too (never made it into AWS, so it isn't part of the live state).
 */
export const ACTIVE_WHITELIST_ENTRY_STATUSES = [
  WhitelistEntryStatus.QUEUED,
  WhitelistEntryStatus.COMMITTED,
  WhitelistEntryStatus.APPLIED,
];

@Entity({ name: 'whitelist_entries' })
@Unique('UQ_whitelist_entries_tenant_id_ip', ['tenantId', 'ip'])
export class WhitelistEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'varchar' })
  tenantId: string;

  @Column({ type: 'varchar' })
  ip: string;

  @Column({
    type: 'enum',
    enum: WhitelistEntryStatus,
    default: WhitelistEntryStatus.QUEUED,
  })
  status: WhitelistEntryStatus;

  @Column({ name: 'added_at', type: 'timestamptz' })
  addedAt: Date;

  @Index()
  @Column({ name: 'request_id', type: 'varchar' })
  requestId: string;
}
