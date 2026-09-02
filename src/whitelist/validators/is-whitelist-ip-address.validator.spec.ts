import { describe, expect, it } from 'vitest';
import { isValidWhitelistIpAddress } from './is-whitelist-ip-address.validator.js';

describe('isValidWhitelistIpAddress', () => {
  it.each([
    ['1.1.1.1', 'public IPv4 address'],
    ['8.8.8.0/24', 'public IPv4 CIDR range'],
    ['2001:4860:4860::8888', 'public IPv6 address'],
    ['2001:4860:4860::/48', 'public IPv6 CIDR range'],
  ])('accepts %s (%s)', (value) => {
    expect(isValidWhitelistIpAddress(value)).toBe(true);
  });

  it.each([
    ['300.1.1.1', 'invalid IPv4 octet'],
    ['203.0.113.5/33', 'invalid CIDR prefix length'],
    ['not-an-ip', 'garbage string'],
    ['', 'empty string'],
  ])('rejects %s (%s) as malformed', (value) => {
    expect(isValidWhitelistIpAddress(value)).toBe(false);
  });

  it.each([
    ['10.0.0.0/8', 'RFC1918 private CIDR range'],
    ['192.168.1.1', 'RFC1918 private address'],
    ['127.0.0.1', 'IPv4 loopback'],
    ['169.254.1.1', 'IPv4 link-local'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fc00::1', 'IPv6 unique local (private) address'],
    ['::ffff:192.168.1.1', 'IPv4-mapped IPv6 address'],
  ])('rejects %s (%s) as private/reserved', (value) => {
    expect(isValidWhitelistIpAddress(value)).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidWhitelistIpAddress(42 as unknown as string)).toBe(false);
    expect(isValidWhitelistIpAddress(null as unknown as string)).toBe(false);
    expect(isValidWhitelistIpAddress(undefined as unknown as string)).toBe(
      false,
    );
  });
});
