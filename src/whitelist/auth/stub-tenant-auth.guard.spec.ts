import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  TENANT_ID_HEADER,
  StubTenantAuthGuard,
} from './stub-tenant-auth.guard.js';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('StubTenantAuthGuard', () => {
  it('allows a request that carries a tenant id header and attaches it to the request', () => {
    const guard = new StubTenantAuthGuard();
    const request: { headers: Record<string, string>; tenantId?: string } = {
      headers: { [TENANT_ID_HEADER]: 'tenant_123' },
    };
    const context = makeContext(request);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.tenantId).toBe('tenant_123');
  });

  it('rejects a request with no tenant id header', () => {
    const guard = new StubTenantAuthGuard();
    const context = makeContext({ headers: {} });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a request with an empty tenant id header', () => {
    const guard = new StubTenantAuthGuard();
    const context = makeContext({ headers: { [TENANT_ID_HEADER]: '' } });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
