import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, it } from 'vitest';
import {
  WhitelistEntry,
  WhitelistEntryStatus,
} from './whitelist-entry.entity.js';

function columnsOf(target: Function) {
  return getMetadataArgsStorage().columns.filter((c) => c.target === target);
}

function columnFor(target: Function, propertyName: string) {
  const column = columnsOf(target).find((c) => c.propertyName === propertyName);
  if (!column) {
    throw new Error(`No column metadata found for ${propertyName}`);
  }
  return column;
}

describe('WhitelistEntry', () => {
  it('maps to the whitelist_entries table', () => {
    const table = getMetadataArgsStorage().tables.find(
      (t) => t.target === WhitelistEntry,
    );

    expect(table?.name).toBe('whitelist_entries');
  });

  it('has a uuid primary key column', () => {
    const idColumn = columnFor(WhitelistEntry, 'id');
    const generation = getMetadataArgsStorage().generations.find(
      (g) => g.target === WhitelistEntry && g.propertyName === 'id',
    );

    expect(idColumn.options.primary).toBe(true);
    expect(generation?.strategy).toBe('uuid');
  });

  it('maps tenantId to the tenant_id column', () => {
    const column = columnFor(WhitelistEntry, 'tenantId');

    expect(column.options.name).toBe('tenant_id');
    expect(column.options.type).toBe('varchar');
  });

  it('has an ip column', () => {
    const column = columnFor(WhitelistEntry, 'ip');

    expect(column.options.type).toBe('varchar');
  });

  it('has a status column restricted to the known lifecycle values, defaulting to queued', () => {
    const column = columnFor(WhitelistEntry, 'status');

    expect(column.options.type).toBe('enum');
    expect(column.options.enum).toBe(WhitelistEntryStatus);
    expect(column.options.default).toBe(WhitelistEntryStatus.QUEUED);
  });

  it('maps addedAt to the added_at timestamp column', () => {
    const column = columnFor(WhitelistEntry, 'addedAt');

    expect(column.options.name).toBe('added_at');
    expect(column.options.type).toBe('timestamptz');
  });

  it('enforces uniqueness on the (tenantId, ip) combination', () => {
    const unique = getMetadataArgsStorage().uniques.find(
      (u) => u.target === WhitelistEntry,
    );

    expect(unique).toBeDefined();
    const columns = unique!.columns as string[];
    expect(columns).toEqual(expect.arrayContaining(['tenantId', 'ip']));
    expect(columns).toHaveLength(2);
  });
});
