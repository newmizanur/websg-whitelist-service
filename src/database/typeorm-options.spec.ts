import { describe, expect, it } from 'vitest';
import { createTypeOrmOptions } from './typeorm-options.js';

describe('createTypeOrmOptions', () => {
  it('maps the injected database config onto TypeOrmModuleOptions', () => {
    const options = createTypeOrmOptions({
      host: 'db.internal',
      port: 5433,
      username: 'app_user',
      password: 'app_pass',
      name: 'app_db',
    });

    expect(options).toMatchObject({
      type: 'postgres',
      host: 'db.internal',
      port: 5433,
      username: 'app_user',
      password: 'app_pass',
      database: 'app_db',
      synchronize: false,
    });
  });
});
