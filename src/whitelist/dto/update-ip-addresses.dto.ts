import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { IsWhitelistIpAddress } from '../validators/is-whitelist-ip-address.validator.js';
import { MAX_ENTRIES_PER_REQUEST } from '../whitelist.config.js';

export { MAX_ENTRIES_PER_REQUEST };

@ValidatorConstraint({ name: 'maxTotalWhitelistEntries', async: false })
class MaxTotalWhitelistEntriesConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as UpdateIpAddressesDto;
    const addCount = Array.isArray(object.add) ? object.add.length : 0;
    const removeCount = Array.isArray(object.remove) ? object.remove.length : 0;
    return addCount + removeCount <= MAX_ENTRIES_PER_REQUEST;
  }

  defaultMessage(): string {
    return `add and remove combined must not exceed ${MAX_ENTRIES_PER_REQUEST} entries per request`;
  }
}

export class UpdateIpAddressesDto {
  @ApiProperty({
    description:
      'Public IPv4/IPv6 addresses or CIDR ranges to add to your whitelist attribution. ' +
      'Bare addresses are stored/reported normalized to /32 (IPv4) or /128 (IPv6), since AWS ' +
      'WAFv2 requires CIDR notation. A CIDR range must already be in canonical form (host bits ' +
      'zeroed) — e.g. 1.1.1.0/24 is accepted, 1.1.1.1/24 is rejected with the canonical form ' +
      'suggested in the error, since it is not auto-corrected. ' +
      `Rejects private/reserved ranges and duplicates. add and remove combined must not ` +
      `exceed ${MAX_ENTRIES_PER_REQUEST} entries per request.`,
    type: [String],
    format: 'ip-or-cidr',
    maxItems: MAX_ENTRIES_PER_REQUEST,
    example: ['8.8.8.8', '1.1.1.0/24'],
  })
  @IsArray()
  @ArrayMaxSize(MAX_ENTRIES_PER_REQUEST)
  @ArrayUnique()
  @IsWhitelistIpAddress({ each: true })
  @Validate(MaxTotalWhitelistEntriesConstraint)
  add!: string[];

  @ApiProperty({
    description:
      'Public IPv4/IPv6 addresses or CIDR ranges to remove from your own whitelist ' +
      'attribution — never affects another tenant’s attribution of the same IP. ' +
      `add and remove combined must not exceed ${MAX_ENTRIES_PER_REQUEST} entries per request.`,
    type: [String],
    format: 'ip-or-cidr',
    maxItems: MAX_ENTRIES_PER_REQUEST,
    example: ['8.8.4.4'],
  })
  @IsArray()
  @ArrayMaxSize(MAX_ENTRIES_PER_REQUEST)
  @ArrayUnique()
  @IsWhitelistIpAddress({ each: true })
  remove!: string[];
}
