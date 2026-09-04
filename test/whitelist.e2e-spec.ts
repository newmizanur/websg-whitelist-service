import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { TENANT_ID_HEADER } from '../src/whitelist/auth/stub-tenant-auth.guard.js';
import {
  WhitelistEntry,
  WhitelistEntryStatus,
} from '../src/whitelist/entities/whitelist-entry.entity.js';
import {
  WHITELIST_PUBLICATION_STATE_ID,
  WhitelistPublicationState,
} from '../src/whitelist/entities/whitelist-publication-state.entity.js';
import { WEBHOOK_SIGNATURE_HEADER } from '../src/whitelist/webhooks/webhook-signature.guard.js';

const WEBHOOK_SECRET = process.env.WHITELIST_WEBHOOK_SECRET as string;

describe('Whitelist API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // rawBody: true mirrors main.ts — WebhookSignatureGuard needs the exact
    // raw bytes, not a re-serialized body, to verify the HMAC signature.
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE whitelist_entries, whitelist_publication_state RESTART IDENTITY CASCADE',
    );
  });

  describe('POST /api/whitelist/ip-addresses', () => {
    it('queues a valid add and returns a 202 with a statusUrl', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/whitelist/ip-addresses')
        .set(TENANT_ID_HEADER, 'tenant_e2e_1')
        .send({ add: ['8.8.8.8'], remove: [] })
        .expect(202);

      expect(response.body.status).toBe('queued');
      expect(response.body.requestId).toMatch(/^wl_/);
      expect(response.body.statusUrl).toBe(
        `/api/whitelist/requests/${response.body.requestId}`,
      );
    });

    it('rejects a private IP with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/whitelist/ip-addresses')
        .set(TENANT_ID_HEADER, 'tenant_e2e_1')
        .send({ add: ['10.0.0.1'], remove: [] })
        .expect(400);
    });

    it('rejects a non-canonical CIDR with 400 naming the canonical form', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/whitelist/ip-addresses')
        .set(TENANT_ID_HEADER, 'tenant_e2e_1')
        .send({ add: ['1.1.1.1/24'], remove: [] })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('1.1.1.0/24');
    });

    it('rejects a request with no tenant id header with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/whitelist/ip-addresses')
        .send({ add: ['8.8.8.8'], remove: [] })
        .expect(401);
    });

    it("a remove never touches another tenant's attribution of a shared IP", async () => {
      await request(app.getHttpServer())
        .post('/api/whitelist/ip-addresses')
        .set(TENANT_ID_HEADER, 'tenant_a')
        .send({ add: ['8.8.4.4'], remove: [] })
        .expect(202);
      await request(app.getHttpServer())
        .post('/api/whitelist/ip-addresses')
        .set(TENANT_ID_HEADER, 'tenant_b')
        .send({ add: ['8.8.4.4'], remove: [] })
        .expect(202);

      await request(app.getHttpServer())
        .post('/api/whitelist/ip-addresses')
        .set(TENANT_ID_HEADER, 'tenant_a')
        .send({ add: [], remove: ['8.8.4.4'] })
        .expect(202);

      const entries = await dataSource
        .getRepository(WhitelistEntry)
        .find({ where: { ip: '8.8.4.4/32' } });

      expect(entries.find((e) => e.tenantId === 'tenant_a')?.status).toBe(
        WhitelistEntryStatus.REMOVED,
      );
      expect(entries.find((e) => e.tenantId === 'tenant_b')?.status).toBe(
        WhitelistEntryStatus.QUEUED,
      );
    });
  });

  describe('GET /api/whitelist/requests/:id', () => {
    it('returns the submitted entries with their current statuses', async () => {
      const submitResponse = await request(app.getHttpServer())
        .post('/api/whitelist/ip-addresses')
        .set(TENANT_ID_HEADER, 'tenant_e2e_2')
        .send({ add: ['8.8.8.8', '1.1.1.0/24'], remove: [] })
        .expect(202);

      const { requestId } = submitResponse.body as { requestId: string };

      const response = await request(app.getHttpServer())
        .get(`/api/whitelist/requests/${requestId}`)
        .set(TENANT_ID_HEADER, 'tenant_e2e_2')
        .expect(200);

      expect(response.body).toMatchObject({
        requestId,
        status: 'pending',
        submittedBy: 'tenant_e2e_2',
      });
      expect(response.body.entries).toEqual(
        expect.arrayContaining([
          { ip: '8.8.8.8/32', action: 'add', status: 'queued' },
          { ip: '1.1.1.0/24', action: 'add', status: 'queued' },
        ]),
      );
    });

    it("returns 404 for a request belonging to another tenant", async () => {
      const submitResponse = await request(app.getHttpServer())
        .post('/api/whitelist/ip-addresses')
        .set(TENANT_ID_HEADER, 'tenant_owner')
        .send({ add: ['8.8.8.8'], remove: [] })
        .expect(202);

      await request(app.getHttpServer())
        .get(`/api/whitelist/requests/${submitResponse.body.requestId}`)
        .set(TENANT_ID_HEADER, 'tenant_other')
        .expect(404);
    });

    it('returns 404 for an unknown request id', async () => {
      await request(app.getHttpServer())
        .get('/api/whitelist/requests/wl_does-not-exist')
        .set(TENANT_ID_HEADER, 'tenant_e2e_2')
        .expect(404);
    });
  });

  describe('POST /api/whitelist/webhooks/terraform-apply', () => {
    const commitSha = 'a'.repeat(40);

    beforeEach(async () => {
      await dataSource.getRepository(WhitelistEntry).insert({
        tenantId: 'tenant_e2e_3',
        ip: '8.8.8.8/32',
        status: WhitelistEntryStatus.COMMITTED,
        requestId: 'wl_seed',
        addedAt: new Date(),
      });
      await dataSource.getRepository(WhitelistPublicationState).insert({
        id: WHITELIST_PUBLICATION_STATE_ID,
        contentHash: 'seed-hash',
        commitSha,
        publishedAt: new Date(),
      });
    });

    function signedRequest(bodyString: string) {
      const signature = `sha256=${createHmac('sha256', WEBHOOK_SECRET)
        .update(bodyString)
        .digest('hex')}`;

      return request(app.getHttpServer())
        .post('/api/whitelist/webhooks/terraform-apply')
        .set('Content-Type', 'application/json')
        .set(WEBHOOK_SIGNATURE_HEADER, signature)
        .send(bodyString);
    }

    async function committedEntryStatus(): Promise<WhitelistEntryStatus | undefined> {
      const entry = await dataSource
        .getRepository(WhitelistEntry)
        .findOneBy({ tenantId: 'tenant_e2e_3', ip: '8.8.8.8/32' });
      return entry?.status;
    }

    it('moves committed entries to applied on a success payload with a valid signature', async () => {
      const body = JSON.stringify({ status: 'success', commitSha });

      await signedRequest(body).expect(200).expect({ status: 'ok' });

      expect(await committedEntryStatus()).toBe(WhitelistEntryStatus.APPLIED);
    });

    it('moves committed entries to failed on a failure payload', async () => {
      const body = JSON.stringify({
        status: 'failure',
        commitSha,
        error: 'apply exited 1',
      });

      await signedRequest(body).expect(200);

      expect(await committedEntryStatus()).toBe(WhitelistEntryStatus.FAILED);
    });

    it('rejects a request with an invalid signature with 401', async () => {
      const body = JSON.stringify({ status: 'success', commitSha });

      await request(app.getHttpServer())
        .post('/api/whitelist/webhooks/terraform-apply')
        .set('Content-Type', 'application/json')
        .set(WEBHOOK_SIGNATURE_HEADER, 'sha256=deadbeef')
        .send(body)
        .expect(401);

      expect(await committedEntryStatus()).toBe(WhitelistEntryStatus.COMMITTED);
    });

    it('rejects a request missing the signature header with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/whitelist/webhooks/terraform-apply')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ status: 'success', commitSha }))
        .expect(401);
    });

    it('no-ops with 200 for an unknown commitSha, leaving entries untouched', async () => {
      const unknownSha = 'b'.repeat(40);
      const body = JSON.stringify({ status: 'success', commitSha: unknownSha });

      await signedRequest(body).expect(200);

      expect(await committedEntryStatus()).toBe(WhitelistEntryStatus.COMMITTED);
    });
  });
});
