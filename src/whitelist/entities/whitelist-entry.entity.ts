import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export enum WhitelistEntryStatus {
  QUEUED = 'queued',
  COMMITTED = 'committed',
  APPLIED = 'applied',
  FAILED = 'failed',
}

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
}
