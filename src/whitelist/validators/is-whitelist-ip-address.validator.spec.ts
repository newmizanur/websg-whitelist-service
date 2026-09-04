import { describe, expect, it } from 'vitest';
import {
  isValidWhitelistIpAddress,
  normalizeWhitelistIpAddress,
  suggestCanonicalCidr,
} from './is-whitelist-ip-address.validator.js';

describe('isValidWhitelistIpAddress', () => {
  it.each([
    ['1.1.1.1', 'public IPv4 address'],
    ['8.8.8.0/24', 'public IPv4 CIDR range'],
    ['1.1.1.0/24', 'canonical IPv4 CIDR (network address matches prefix)'],
    ['8.8.8.8/32', 'single-host /32 CIDR (host bits are the whole address)'],
    ['2001:4860:4860::8888', 'public IPv6 address'],
    ['2001:4860:4860::/48', 'public IPv6 CIDR range'],
    [
      '2001:4860:4860::8888/128',
      'single-host /128 CIDR (host bits are the whole address)',
    ],
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
    ['1.1.1.1/24', 'IPv4 CIDR whose address has non-zero host bits'],
    [
      '2001:4860:4860::8888/48',
      'IPv6 CIDR whose address has non-zero host bits',
    ],
  ])(
    'rejects %s (%s) as a non-canonical network address (AWS WAFv2 requires canonical CIDR)',
    (value) => {
      expect(isValidWhitelistIpAddress(value)).toBe(false);
    },
  );

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

describe('normalizeWhitelistIpAddress', () => {
  it('normalizes a bare IPv4 address to a /32 CIDR', () => {
    expect(normalizeWhitelistIpAddress('8.8.8.8')).toBe('8.8.8.8/32');
  });

  it('normalizes a bare IPv6 address to a /128 CIDR', () => {
    expect(normalizeWhitelistIpAddress('2001:4860:4860::8888')).toBe(
      '2001:4860:4860::8888/128',
    );
  });

  it('leaves an IPv4 CIDR range unchanged', () => {
    expect(normalizeWhitelistIpAddress('1.1.1.0/24')).toBe('1.1.1.0/24');
  });

  it('leaves an already-normalized IPv4 /32 unchanged (idempotent)', () => {
    expect(normalizeWhitelistIpAddress('8.8.8.8/32')).toBe('8.8.8.8/32');
  });

  it('leaves an already-normalized IPv6 /128 unchanged (idempotent)', () => {
    expect(normalizeWhitelistIpAddress('2001:4860:4860::8888/128')).toBe(
      '2001:4860:4860::8888/128',
    );
  });

  it('leaves an IPv6 CIDR range unchanged', () => {
    expect(normalizeWhitelistIpAddress('2001:4860:4860::/48')).toBe(
      '2001:4860:4860::/48',
    );
  });

  it('passes through malformed input unchanged rather than throwing', () => {
    expect(normalizeWhitelistIpAddress('not-an-ip')).toBe('not-an-ip');
    expect(normalizeWhitelistIpAddress('')).toBe('');
  });
});

describe('suggestCanonicalCidr', () => {
  it('suggests the canonical network address for a non-canonical IPv4 CIDR', () => {
    expect(suggestCanonicalCidr('1.1.1.1/24')).toBe('1.1.1.0/24');
  });

  it('suggests the canonical network address for a non-canonical IPv6 CIDR', () => {
    expect(suggestCanonicalCidr('2001:4860:4860::8888/48')).toBe(
      '2001:4860:4860::/48',
    );
  });

  it('returns undefined for an already-canonical CIDR', () => {
    expect(suggestCanonicalCidr('1.1.1.0/24')).toBeUndefined();
  });

  it('returns undefined for a /32 (always canonical by definition)', () => {
    expect(suggestCanonicalCidr('8.8.8.8/32')).toBeUndefined();
  });

  it('returns undefined for a /128 (always canonical by definition)', () => {
    expect(suggestCanonicalCidr('2001:4860:4860::8888/128')).toBeUndefined();
  });

  it('returns undefined for a bare address (not CIDR)', () => {
    expect(suggestCanonicalCidr('8.8.8.8')).toBeUndefined();
  });

  it('returns undefined for malformed input', () => {
    expect(suggestCanonicalCidr('not-an-ip')).toBeUndefined();
  });

  it('returns undefined for a non-canonical CIDR outside the allowed unicast range', () => {
    // Non-canonical AND private — the range problem takes precedence; no
    // point suggesting a canonical form of an address we'd reject anyway.
    expect(suggestCanonicalCidr('10.0.0.1/24')).toBeUndefined();
  });
});
