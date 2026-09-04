import { describe, expect, it } from 'vitest';
import {
  WhitelistEntry,
  WhitelistEntryStatus,
} from '../entities/whitelist-entry.entity.js';
import {
  buildWhitelistTfvars,
  generateWhitelistTfvarsContent,
} from './whitelist-tfvars.generator.js';

function makeEntry(overrides: {
  ip: string;
  tenantId: string;
  addedAt: Date;
  status?: WhitelistEntryStatus;
  id?: string;
}): WhitelistEntry {
  return {
    id: overrides.id ?? 'entry-id',
    tenantId: overrides.tenantId,
    ip: overrides.ip,
    status: overrides.status ?? WhitelistEntryStatus.APPLIED,
    addedAt: overrides.addedAt,
    requestId: 'request-id',
  };
}

describe('buildWhitelistTfvars', () => {
  it('returns an empty map for no active entries', () => {
    const result = buildWhitelistTfvars([]);

    expect(result).toEqual({ cms_whitelist_ips: {} });
  });

  it('includes a single tenant attribution for a single entry', () => {
    const entry = makeEntry({
      ip: '203.0.113.5',
      tenantId: 'tenant_123',
      addedAt: new Date('2026-09-01T08:30:00Z'),
    });

    const result = buildWhitelistTfvars([entry]);

    expect(result).toEqual({
      cms_whitelist_ips: {
        '203.0.113.5/32': {
          tenant: 'tenant_123',
          addedAt: '2026-09-01T08:30:00.000Z',
        },
      },
    });
  });

  it('dedups an IP shared by multiple tenants, keeping the earliest attribution', () => {
    const later = makeEntry({
      ip: '203.0.113.5',
      tenantId: 'tenant_456',
      addedAt: new Date('2026-09-02T10:00:00Z'),
    });
    const earlier = makeEntry({
      ip: '203.0.113.5',
      tenantId: 'tenant_123',
      addedAt: new Date('2026-09-01T08:30:00Z'),
    });

    const result = buildWhitelistTfvars([later, earlier]);

    expect(Object.keys(result.cms_whitelist_ips)).toHaveLength(1);
    expect(result.cms_whitelist_ips['203.0.113.5/32']).toEqual({
      tenant: 'tenant_123',
      addedAt: '2026-09-01T08:30:00.000Z',
    });
  });

  it('breaks a same-timestamp tie by ascending tenantId', () => {
    const sameInstant = new Date('2026-09-01T08:30:00Z');
    const tenantB = makeEntry({
      ip: '203.0.113.5',
      tenantId: 'tenant_b',
      addedAt: sameInstant,
    });
    const tenantA = makeEntry({
      ip: '203.0.113.5',
      tenantId: 'tenant_a',
      addedAt: sameInstant,
    });

    const result = buildWhitelistTfvars([tenantB, tenantA]);

    expect(result.cms_whitelist_ips['203.0.113.5/32'].tenant).toBe('tenant_a');
  });

  it('sorts IPs ascending in the output', () => {
    const entries = [
      makeEntry({
        ip: '203.0.113.5',
        tenantId: 'tenant_1',
        addedAt: new Date('2026-09-01T00:00:00Z'),
      }),
      makeEntry({
        ip: '198.51.100.0/24',
        tenantId: 'tenant_2',
        addedAt: new Date('2026-09-01T00:00:00Z'),
      }),
      makeEntry({
        ip: '8.8.8.8',
        tenantId: 'tenant_3',
        addedAt: new Date('2026-09-01T00:00:00Z'),
      }),
    ];

    const result = buildWhitelistTfvars(entries);

    expect(Object.keys(result.cms_whitelist_ips)).toEqual([
      '198.51.100.0/24',
      '203.0.113.5/32',
      '8.8.8.8/32',
    ]);
  });

  it('never emits a bare address — every key is valid CIDR (AWS WAFv2 requires it)', () => {
    const entries = [
      makeEntry({
        ip: '8.8.8.8',
        tenantId: 'tenant_1',
        addedAt: new Date('2026-09-01T00:00:00Z'),
      }),
      makeEntry({
        ip: '2001:4860:4860::8888',
        tenantId: 'tenant_2',
        addedAt: new Date('2026-09-01T00:00:00Z'),
      }),
      makeEntry({
        ip: '198.51.100.0/24',
        tenantId: 'tenant_3',
        addedAt: new Date('2026-09-01T00:00:00Z'),
      }),
      makeEntry({
        ip: '2001:db8::/32',
        tenantId: 'tenant_4',
        addedAt: new Date('2026-09-01T00:00:00Z'),
      }),
    ];

    const result = buildWhitelistTfvars(entries);

    const keys = Object.keys(result.cms_whitelist_ips);
    expect(keys).toHaveLength(4);
    for (const key of keys) {
      expect(key).toMatch(/\/\d+$/);
    }
    expect(keys).toEqual(
      expect.arrayContaining([
        '8.8.8.8/32',
        '2001:4860:4860::8888/128',
        '198.51.100.0/24',
        '2001:db8::/32',
      ]),
    );
  });

  it('dedups a bare address with its already-normalized CIDR equivalent as the same IP', () => {
    const bareForm = makeEntry({
      ip: '8.8.8.8',
      tenantId: 'tenant_legacy',
      addedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const normalizedForm = makeEntry({
      ip: '8.8.8.8/32',
      tenantId: 'tenant_new',
      addedAt: new Date('2026-09-02T00:00:00Z'),
    });

    const result = buildWhitelistTfvars([bareForm, normalizedForm]);

    expect(Object.keys(result.cms_whitelist_ips)).toEqual(['8.8.8.8/32']);
    expect(result.cms_whitelist_ips['8.8.8.8/32'].tenant).toBe('tenant_legacy');
  });

  it('produces the same output regardless of input order (stable)', () => {
    const entries = [
      makeEntry({
        ip: '203.0.113.5',
        tenantId: 'tenant_1',
        addedAt: new Date('2026-09-01T00:00:00Z'),
      }),
      makeEntry({
        ip: '198.51.100.0/24',
        tenantId: 'tenant_2',
        addedAt: new Date('2026-09-02T00:00:00Z'),
      }),
      makeEntry({
        ip: '198.51.100.0/24',
        tenantId: 'tenant_4',
        addedAt: new Date('2026-09-01T00:00:00Z'),
      }),
    ];

    const forward = buildWhitelistTfvars(entries);
    const reversed = buildWhitelistTfvars([...entries].reverse());

    expect(forward).toEqual(reversed);
  });

  it('keeps a shared IP present while at least one active attribution remains', () => {
    const remainingTenant = makeEntry({
      ip: '203.0.113.5',
      tenantId: 'tenant_456',
      addedAt: new Date('2026-09-02T10:00:00Z'),
    });

    const result = buildWhitelistTfvars([remainingTenant]);

    expect(result.cms_whitelist_ips['203.0.113.5/32']).toEqual({
      tenant: 'tenant_456',
      addedAt: '2026-09-02T10:00:00.000Z',
    });
  });

  it('drops an IP entirely once no active attribution remains', () => {
    const result = buildWhitelistTfvars([]);

    expect(result.cms_whitelist_ips['203.0.113.5']).toBeUndefined();
  });
});

describe('generateWhitelistTfvarsContent', () => {
  it('renders the built tfvars as pretty-printed JSON with a trailing newline', () => {
    const entry = makeEntry({
      ip: '203.0.113.5',
      tenantId: 'tenant_123',
      addedAt: new Date('2026-09-01T08:30:00Z'),
    });

    const content = generateWhitelistTfvarsContent([entry]);

    expect(content).toBe(
      `${JSON.stringify(
        {
          cms_whitelist_ips: {
            '203.0.113.5/32': {
              tenant: 'tenant_123',
              addedAt: '2026-09-01T08:30:00.000Z',
            },
          },
        },
        null,
        2,
      )}\n`,
    );
  });
});
