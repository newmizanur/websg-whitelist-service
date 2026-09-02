import { Table, type MigrationInterface, type QueryRunner } from 'typeorm';
import { WhitelistEntryStatus } from '../../whitelist/entities/whitelist-entry.entity.js';

const TABLE_NAME = 'whitelist_entries';

export class CreateWhitelistEntries1788340650231 implements MigrationInterface {
  name = 'CreateWhitelistEntries1788340650231';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: TABLE_NAME,
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'tenant_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'ip',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: Object.values(WhitelistEntryStatus),
            default: `'${WhitelistEntryStatus.QUEUED}'`,
          },
          {
            name: 'added_at',
            type: 'timestamptz',
            isNullable: false,
          },
        ],
        uniques: [
          {
            name: 'UQ_whitelist_entries_tenant_id_ip',
            columnNames: ['tenant_id', 'ip'],
          },
        ],
        indices: [
          {
            name: 'IDX_whitelist_entries_tenant_id',
            columnNames: ['tenant_id'],
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(TABLE_NAME);
  }
}
