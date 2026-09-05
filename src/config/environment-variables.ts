import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

/**
 * Passed to ConfigModule.forRoot({ validate }) — fails fast at boot on a
 * malformed value (e.g. PORT=abc) instead of surfacing as a confusing
 * downstream error (NaN port, TypeORM connection failure). Every field is
 * optional: nothing here is required to boot (see README's two Local setup
 * paths and the NoopPublisher fallback) — this only validates the *format*
 * of whatever was actually provided.
 *
 * Deliberately not validated as a strict enum: NODE_ENV and
 * WHITELIST_SWAGGER_ENABLED. Both already have a tested, intentional
 * graceful-fallback design (any unrecognized value degrades rather than
 * errors — see resolveSwaggerEnabled) that a strict allow-list would break.
 */
class EnvironmentVariables {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  DB_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT?: number;

  @IsOptional()
  @IsString()
  DB_USERNAME?: string;

  @IsOptional()
  @IsString()
  DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  DB_NAME?: string;

  @IsOptional()
  @IsString()
  WHITELIST_SWAGGER_ENABLED?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  WHITELIST_MAX_ENTRIES_PER_REQUEST?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  WHITELIST_BATCH_INTERVAL_MS?: number;

  @IsOptional()
  @IsString()
  WHITELIST_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  WHITELIST_GITHUB_OWNER?: string;

  @IsOptional()
  @IsString()
  WHITELIST_GITHUB_REPO?: string;

  @IsOptional()
  @IsString()
  WHITELIST_GITHUB_TOKEN?: string;

  @IsOptional()
  @IsString()
  WHITELIST_GITHUB_PATH?: string;

  @IsOptional()
  @IsString()
  WHITELIST_GITHUB_BRANCH?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
