import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Tracks the last successfully published whitelist state so the batching
 * worker can skip publishing when nothing has changed (section 3c), and so the
 * terraform-apply webhook can tell which commit its status update belongs to.
 * One row per shared whitelist — today there's only one (section 2 assumption 4), so
 * a fixed singleton id is used rather than a generated key.
 */
export const WHITELIST_PUBLICATION_STATE_ID = 'cms-shared-whitelist';

@Entity({ name: 'whitelist_publication_state' })
export class WhitelistPublicationState {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'content_hash', type: 'varchar' })
  contentHash: string;

  @Column({ name: 'commit_sha', type: 'varchar' })
  commitSha: string;

  @Column({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;
}
