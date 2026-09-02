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
  @IsArray()
  @ArrayMaxSize(MAX_ENTRIES_PER_REQUEST)
  @ArrayUnique()
  @IsWhitelistIpAddress({ each: true })
  @Validate(MaxTotalWhitelistEntriesConstraint)
  add!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_ENTRIES_PER_REQUEST)
  @ArrayUnique()
  @IsWhitelistIpAddress({ each: true })
  remove!: string[];
}
