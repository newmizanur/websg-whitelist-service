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
    return address.range() === ALLOWED_RANGE && isCanonicalCidr(value);
  }

  if (ipaddr.isValid(value)) {
    return ipaddr.parse(value).range() === ALLOWED_RANGE;
  }

  return false;
}

/**
 * AWS WAFv2 requires CIDR entries in canonical form: the address must be the
 * network address for its prefix length (host bits zeroed) — 1.1.1.0/24 is
 * valid, 1.1.1.1/24 is not, since .1 isn't the network address of that /24.
 * Assumes `value` is already a syntactically-valid CIDR string.
 */
function isCanonicalCidr(value: string): boolean {
  const [address] = ipaddr.parseCIDR(value);
  const networkAddress =
    address.kind() === 'ipv6'
      ? ipaddr.IPv6.networkAddressFromCIDR(value)
      : ipaddr.IPv4.networkAddressFromCIDR(value);
  return (
    address.toByteArray().join(',') === networkAddress.toByteArray().join(',')
  );
}

/**
 * For a syntactically-valid, in-range CIDR whose only problem is a
 * non-canonical network address, returns the canonical form to suggest back
 * to the tenant (e.g. "did you mean 1.1.1.0/24?"). Returns undefined for
 * anything else — already-canonical CIDR, a bare address, malformed input,
 * or a CIDR that's out of range for an unrelated reason (private/reserved) —
 * so the caller doesn't suggest a "fix" for an address we'd reject anyway.
 */
export function suggestCanonicalCidr(value: string): string | undefined {
  if (!ipaddr.isValidCIDR(value)) {
    return undefined;
  }

  const [address, prefixLength] = ipaddr.parseCIDR(value);
  if (address.range() !== ALLOWED_RANGE || isCanonicalCidr(value)) {
    return undefined;
  }

  const networkAddress =
    address.kind() === 'ipv6'
      ? ipaddr.IPv6.networkAddressFromCIDR(value)
      : ipaddr.IPv4.networkAddressFromCIDR(value);
  return `${networkAddress.toString()}/${prefixLength}`;
}

/**
 * AWS WAFv2 IPSet requires every address in CIDR notation — a bare IPv4/IPv6
 * address is not accepted, only e.g. 8.8.8.8/32 or ::1/128. Call this after
 * isValidWhitelistIpAddress confirms the input is valid, before it's
 * persisted or used downstream, so whitelist_entries.ip (and the generated
 * tfvars) always hold CIDR form. Already-CIDR input and malformed input both
 * pass through unchanged — malformed values are left for the validator to
 * reject, not silently swallowed here.
 */
export function normalizeWhitelistIpAddress(value: string): string {
  if (ipaddr.isValidCIDR(value)) {
    return value;
  }

  if (ipaddr.isValid(value)) {
    const prefixLength = ipaddr.parse(value).kind() === 'ipv6' ? 128 : 32;
    return `${value}/${prefixLength}`;
  }

  return value;
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
          // With `each: true`, class-validator always puts the *whole array*
          // in args.value here — never the specific element that failed —
          // even though validate() above ran per-element. Recomputing which
          // entries are actually invalid is the only way to name them.
          const values = Array.isArray(args.value) ? args.value : [args.value];
          const invalidValues = values.filter(
            (value) => !isValidWhitelistIpAddress(value),
          );
          const descriptions = invalidValues.map((value) => {
            const suggestion =
              typeof value === 'string'
                ? suggestCanonicalCidr(value)
                : undefined;
            return suggestion
              ? `${value} is invalid; did you mean ${suggestion}?`
              : JSON.stringify(value);
          });
          return `${args.property} contains entries that are not public IPv4/IPv6 addresses or CIDR ranges: ${descriptions.join(', ')}`;
        },
      },
    });
  };
}
