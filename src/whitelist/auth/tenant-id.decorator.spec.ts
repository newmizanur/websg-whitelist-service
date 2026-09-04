import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { tenantIdParamFactory } from './tenant-id.decorator.js';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('tenantIdParamFactory', () => {
  it('returns the tenant id attached to the request by the auth guard', () => {
    const context = makeContext({ tenantId: 'tenant_123' });

    expect(tenantIdParamFactory(undefined, context)).toBe('tenant_123');
  });

  it('throws when the request has no tenant id (guard was not applied)', () => {
    const context = makeContext({});

    expect(() => tenantIdParamFactory(undefined, context)).toThrow(
      UnauthorizedException,
    );
  });
});
