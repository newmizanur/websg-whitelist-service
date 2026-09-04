import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { WhitelistPublicationState } from './whitelist-publication-state.entity.js';

function columnFor(target: Function, propertyName: string) {
  const column = getMetadataArgsStorage().columns.find(
    (c) => c.target === target && c.propertyName === propertyName,
  );
  if (!column) {
    throw new Error(`No column metadata found for ${propertyName}`);
  }
  return column;
}

describe('WhitelistPublicationState', () => {
  it('maps to the whitelist_publication_state table', () => {
    const table = getMetadataArgsStorage().tables.find(
      (t) => t.target === WhitelistPublicationState,
    );

    expect(table?.name).toBe('whitelist_publication_state');
  });

  it('has a varchar primary key column that is not auto-generated', () => {
    const idColumn = columnFor(WhitelistPublicationState, 'id');
    const generation = getMetadataArgsStorage().generations.find(
      (g) => g.target === WhitelistPublicationState && g.propertyName === 'id',
    );

    expect(idColumn.options.primary).toBe(true);
    expect(idColumn.options.type).toBe('varchar');
    expect(generation).toBeUndefined();
  });

  it('maps contentHash to the content_hash column', () => {
    const column = columnFor(WhitelistPublicationState, 'contentHash');

    expect(column.options.name).toBe('content_hash');
    expect(column.options.type).toBe('varchar');
  });

  it('maps commitSha to the commit_sha column', () => {
    const column = columnFor(WhitelistPublicationState, 'commitSha');

    expect(column.options.name).toBe('commit_sha');
    expect(column.options.type).toBe('varchar');
  });

  it('maps publishedAt to the published_at timestamp column', () => {
    const column = columnFor(WhitelistPublicationState, 'publishedAt');

    expect(column.options.name).toBe('published_at');
    expect(column.options.type).toBe('timestamptz');
  });
});
