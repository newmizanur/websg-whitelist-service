import {
  TableColumn,
  TableIndex,
  type MigrationInterface,
  type QueryRunner,
} from 'typeorm';

const TABLE_NAME = 'whitelist_entries';
const STATUS_ENUM_NAME = 'whitelist_entries_status_enum';
const REQUEST_ID_COLUMN = 'request_id';
const REQUEST_ID_INDEX = 'IDX_whitelist_entries_request_id';

export class AddRemovedStatusAndRequestId1788424792456 implements MigrationInterface {
  name = 'AddRemovedStatusAndRequestId1788424792456';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "${STATUS_ENUM_NAME}" ADD VALUE IF NOT EXISTS 'removed'`,
    );

    await queryRunner.addColumn(
      TABLE_NAME,
      new TableColumn({
        name: REQUEST_ID_COLUMN,
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      TABLE_NAME,
      new TableIndex({
        name: REQUEST_ID_INDEX,
        columnNames: [REQUEST_ID_COLUMN],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres has no simple "DROP VALUE" for enum types — removing 'removed'
    // would require rebuilding the type and is deliberately left as a manual
    // step if this migration is ever rolled back.
    await queryRunner.dropIndex(TABLE_NAME, REQUEST_ID_INDEX);
    await queryRunner.dropColumn(TABLE_NAME, REQUEST_ID_COLUMN);
  }
}
