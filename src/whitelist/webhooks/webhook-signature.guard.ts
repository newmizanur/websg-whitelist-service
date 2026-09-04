import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_SECRET_ENV_VAR = 'WHITELIST_WEBHOOK_SECRET';
export const WEBHOOK_SIGNATURE_HEADER = 'x-hub-signature-256';

export function resolveWebhookSecret(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env[WEBHOOK_SECRET_ENV_VAR];
}

interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}

/**
 * Verifies GitHub's HMAC-SHA256 webhook signature (section 3a step 7, section 6) over the
 * exact raw request bytes — never `JSON.stringify(req.body)`, since
 * re-serializing a parsed payload can change byte-for-byte content (key
 * order, whitespace) and invalidate an otherwise-genuine signature. Requires
 * `NestFactory.create(AppModule, { rawBody: true })` so `req.rawBody` exists.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(
    @Optional()
    private readonly secret: string | undefined = resolveWebhookSecret(),
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.secret) {
      throw new UnauthorizedException(
        'Webhook signature verification is not configured',
      );
    }

    const request = context.switchToHttp().getRequest<WebhookRequest>();
    const signature = request.headers[WEBHOOK_SIGNATURE_HEADER];

    if (typeof signature !== 'string' || !request.rawBody) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expectedSignature = `sha256=${createHmac('sha256', this.secret)
      .update(request.rawBody)
      .digest('hex')}`;

    if (!isSignatureValid(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}

function isSignatureValid(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, 'utf-8');
  const expectedBuffer = Buffer.from(expected, 'utf-8');
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
