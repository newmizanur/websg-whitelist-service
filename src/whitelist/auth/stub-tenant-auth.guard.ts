import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

export const TENANT_ID_HEADER = 'x-tenant-id';

interface TenantRequest {
  headers: Record<string, string | string[] | undefined>;
  tenantId?: string;
}

/**
 * TEMPORARY STUB — system_design.md section 4 assumes tenant identity is already
 * established upstream (portal auth, e.g. Cognito/OIDC) and the backend
 * receives a verified tenant ID via JWT; building that verification is out
 * of scope here. This guard stands in for that middleware by trusting an
 * `x-tenant-id` header outright and attaching it to `request.tenantId`, the
 * same contract a real JWT guard would fulfill. It must be replaced with
 * actual JWT verification before this ever runs in production — trusting a
 * client-supplied header for tenant identity is not secure.
 */
@Injectable()
export class StubTenantAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const tenantId = request.headers[TENANT_ID_HEADER];

    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      throw new UnauthorizedException('Missing tenant context');
    }

    request.tenantId = tenantId;
    return true;
  }
}
