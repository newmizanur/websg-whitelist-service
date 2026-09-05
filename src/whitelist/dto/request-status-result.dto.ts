import { ApiProperty } from '@nestjs/swagger';
import { WhitelistEntryStatus } from '../entities/whitelist-entry.entity.js';

export const REMOVED_FROM_ACCOUNT = 'removed from your account';
export const STILL_ACTIVE_FOR_ANOTHER_TENANT =
  'still active - held by another tenant';

export type RequestOverallStatus = 'pending' | 'applied' | 'failed';

export class EntryStatusDescriptor {
  @ApiProperty({ example: '8.8.8.8/32' })
  ip: string;

  @ApiProperty({ enum: ['add', 'remove'] })
  action: 'add' | 'remove';

  @ApiProperty({
    description:
      'One of the WhitelistEntryStatus enum values for an "add" entry, or one of two ' +
      'human-readable phrases for a "remove" entry — see README\'s Status values table.',
    example: 'queued',
  })
  status:
    | WhitelistEntryStatus
    | typeof REMOVED_FROM_ACCOUNT
    | typeof STILL_ACTIVE_FOR_ANOTHER_TENANT;
}

export class RequestStatusResult {
  @ApiProperty({ example: 'wl_3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  requestId: string;

  @ApiProperty({ enum: ['pending', 'applied', 'failed'] })
  status: RequestOverallStatus;

  @ApiProperty({ example: 'tenant_123' })
  submittedBy: string;

  @ApiProperty({ type: [EntryStatusDescriptor] })
  entries: EntryStatusDescriptor[];
}
