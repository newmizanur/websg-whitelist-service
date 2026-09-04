import { Table, type MigrationInterface, type QueryRunner } from 'typeorm';

const TABLE_NAME = 'whitelist_publication_state';

export class CreateWhitelistPublicationState1788406416595 implements MigrationInterface {
  name = 'CreateWhitelistPublicationState1788406416595';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: TABLE_NAME,
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
          },
          {
            name: 'content_hash',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'commit_sha',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'published_at',
            type: 'timestamptz',
            isNullable: false,
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
