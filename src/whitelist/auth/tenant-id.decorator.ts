import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

interface TenantRequest {
  tenantId?: string;
}

export function tenantIdParamFactory(
  _data: unknown,
  context: ExecutionContext,
): string {
  const request = context.switchToHttp().getRequest<TenantRequest>();

  if (!request.tenantId) {
    throw new UnauthorizedException('Missing tenant context');
  }

  return request.tenantId;
}

export const TenantId = createParamDecorator(tenantIdParamFactory);
