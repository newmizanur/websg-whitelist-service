import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TerraformApplyWebhookDto } from './terraform-apply.dto.js';
import { TerraformApplyService } from './terraform-apply.service.js';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WebhookSignatureGuard,
} from './webhook-signature.guard.js';

@ApiTags('webhooks (internal)')
@Controller('api/whitelist/webhooks')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class TerraformApplyController {
  constructor(private readonly terraformApplyService: TerraformApplyService) {}

  @Post('terraform-apply')
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Internal — GitHub Actions only, HMAC-verified',
    description:
      'Not a tenant-facing endpoint. Called by .github/workflows/whitelist-apply.yml after ' +
      '`terraform apply` completes (system_design.md section 3a step 5, section 6). Requests must carry a ' +
      `valid ${WEBHOOK_SIGNATURE_HEADER} HMAC-SHA256 signature computed over the raw body with ` +
      'the shared WHITELIST_WEBHOOK_SECRET — anything else is rejected before the payload is read.',
  })
  @ApiHeader({
    name: WEBHOOK_SIGNATURE_HEADER,
    description:
      'HMAC-SHA256 of the raw request body, hex-encoded and prefixed "sha256=".',
    required: true,
    example: 'sha256=5257a869e7...',
  })
  @ApiResponse({
    status: 200,
    description: 'Always returned, including no-ops, so GitHub does not retry.',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid, or unconfigured HMAC signature.',
  })
  async handleTerraformApply(
    @Body() payload: TerraformApplyWebhookDto,
  ): Promise<{ status: 'ok' }> {
    await this.terraformApplyService.handle(payload);
    return { status: 'ok' };
  }
}
