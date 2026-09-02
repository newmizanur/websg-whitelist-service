import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import ipaddr from 'ipaddr.js';

/**
 * Only 'unicast' is normal, publicly-routable address space for both IPv4
 * and IPv6 — every other ipaddr.js range classification (private, loopback,
 * link-local, reserved, multicast, ipv4-mapped, etc.) is something a CMS
 * whitelist should never contain, so it's rejected by omission.
 */
const ALLOWED_RANGE = 'unicast';

export function isValidWhitelistIpAddress(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  if (ipaddr.isValidCIDR(value)) {
    const [address] = ipaddr.parseCIDR(value);
    return address.range() === ALLOWED_RANGE;
  }

  if (ipaddr.isValid(value)) {
    return ipaddr.parse(value).range() === ALLOWED_RANGE;
  }

  return false;
}

export function IsWhitelistIpAddress(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isWhitelistIpAddress',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isValidWhitelistIpAddress(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must contain only public IPv4/IPv6 addresses or CIDR ranges (received: ${JSON.stringify(args.value)})`;
        },
      },
    });
  };
}
