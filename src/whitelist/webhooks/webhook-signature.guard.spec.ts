import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WebhookSignatureGuard,
} from './webhook-signature.guard.js';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function sign(secret: string, body: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('WebhookSignatureGuard', () => {
  it('allows a request with a valid signature computed over the raw body', () => {
    const secret = 'test-secret';
    const rawBody = Buffer.from(
      '{"status":"success","commitSha":"abc123"}',
      'utf-8',
    );
    const guard = new WebhookSignatureGuard(secret);
    const context = makeContext({
      headers: { [WEBHOOK_SIGNATURE_HEADER]: sign(secret, rawBody) },
      rawBody,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when the signature header is missing', () => {
    const guard = new WebhookSignatureGuard('test-secret');
    const context = makeContext({
      headers: {},
      rawBody: Buffer.from('{}', 'utf-8'),
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects when the signature does not match the body', () => {
    const secret = 'test-secret';
    const rawBody = Buffer.from(
      '{"status":"success","commitSha":"abc123"}',
      'utf-8',
    );
    const guard = new WebhookSignatureGuard(secret);
    const context = makeContext({
      headers: {
        [WEBHOOK_SIGNATURE_HEADER]: sign(
          secret,
          Buffer.from('tampered', 'utf-8'),
        ),
      },
      rawBody,
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects when the raw body is unavailable', () => {
    const secret = 'test-secret';
    const guard = new WebhookSignatureGuard(secret);
    const context = makeContext({
      headers: {
        [WEBHOOK_SIGNATURE_HEADER]: sign(secret, Buffer.from('{}', 'utf-8')),
      },
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects every request when no secret is configured, even with a well-formed header', () => {
    const guard = new WebhookSignatureGuard(undefined);
    const rawBody = Buffer.from('{}', 'utf-8');
    const context = makeContext({
      headers: { [WEBHOOK_SIGNATURE_HEADER]: sign('anything', rawBody) },
      rawBody,
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('verifies against the raw request body, not a re-serialized version of the parsed JSON', () => {
    const secret = 'test-secret';
    const parsedBody = { status: 'success', commitSha: 'abc123' };
    // GitHub's actual bytes on the wire — deliberately non-canonical spacing,
    // so JSON.stringify(parsedBody) would produce different bytes than this.
    const rawBody = Buffer.from(
      '{"status":"success",  "commitSha":"abc123"}',
      'utf-8',
    );
    const reSerializedBody = Buffer.from(JSON.stringify(parsedBody), 'utf-8');
    expect(rawBody.equals(reSerializedBody)).toBe(false);

    const guard = new WebhookSignatureGuard(secret);
    const context = makeContext({
      headers: { [WEBHOOK_SIGNATURE_HEADER]: sign(secret, rawBody) },
      rawBody,
      body: parsedBody,
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
