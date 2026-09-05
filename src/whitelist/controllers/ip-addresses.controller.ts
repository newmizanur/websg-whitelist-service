import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  StubTenantAuthGuard,
  TENANT_ID_HEADER,
} from '../auth/stub-tenant-auth.guard.js';
import { TenantId } from '../auth/tenant-id.decorator.js';
import { UpdateIpAddressesDto } from '../dto/update-ip-addresses.dto.js';
import {
  IpAddressesService,
  RequestStatusResult,
} from '../services/ip-addresses.service.js';

export class SubmitIpAddressesResponse {
  @ApiProperty({ example: 'wl_3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  requestId: string;

  @ApiProperty({ enum: ['queued'] })
  status: 'queued';

  @ApiProperty({
    example: '/api/whitelist/requests/wl_3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  statusUrl: string;
}

@ApiTags('whitelist')
@ApiHeader({
  name: TENANT_ID_HEADER,
  description:
    'Tenant identity, trusted as-is by StubTenantAuthGuard (see its docstring) — a temporary ' +
    'stand-in for the JWT-derived tenant ID a real deployment would use (system_design.md section 4).',
  required: true,
  example: 'tenant_123',
})
@ApiResponse({ status: 401, description: 'Missing or empty tenant id header.' })
@Controller('api/whitelist')
@UseGuards(StubTenantAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class IpAddressesController {
  constructor(private readonly ipAddressesService: IpAddressesService) {}

  @Post('ip-addresses')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue add/remove changes to your whitelist attribution',
    description:
      'Validates the request and queues it for the batching worker (system_design.md sections 3a and 3c); ' +
      'does not apply synchronously. Poll the returned statusUrl for progress.',
  })
  @ApiAcceptedResponse({
    description: 'Accepted — the request has been queued.',
    type: SubmitIpAddressesResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed: an entry is not a valid public IPv4/IPv6 address or CIDR range, is a ' +
      'private/reserved range, is duplicated within add or remove, or add and remove combined ' +
      'exceed the per-request entry limit.',
  })
  async submit(
    @TenantId() tenantId: string,
    @Body() dto: UpdateIpAddressesDto,
  ): Promise<SubmitIpAddressesResponse> {
    const { requestId } = await this.ipAddressesService.submit(tenantId, dto);

    return {
      requestId,
      status: 'queued',
      statusUrl: `/api/whitelist/requests/${requestId}`,
    };
  }

  @Get('requests/:id')
  @ApiOperation({
    summary: 'Get the status of a previously submitted add/remove request',
    description:
      'Only returns rows belonging to the calling tenant. A "remove" entry reports whether the ' +
      'IP was fully removed or is still active because another tenant also holds it (section 4).',
  })
  @ApiParam({
    name: 'id',
    description: 'The requestId returned by POST /api/whitelist/ip-addresses.',
    example: 'wl_3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({
    description: 'The current status of every entry covered by this request.',
    type: RequestStatusResult,
  })
  @ApiResponse({
    status: 404,
    description: 'No request with that id exists for the calling tenant.',
  })
  async getStatus(
    @TenantId() tenantId: string,
    @Param('id') requestId: string,
  ): Promise<RequestStatusResult> {
    const result = await this.ipAddressesService.getRequestStatus(
      tenantId,
      requestId,
    );

    if (!result) {
      throw new NotFoundException(`No request found with id ${requestId}`);
    }

    return result;
  }
}
