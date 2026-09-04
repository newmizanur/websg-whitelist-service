import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export enum TerraformApplyStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

/**
 * Internal — sent by the GitHub Actions workflow in .github/workflows/whitelist-apply.yml
 * after `terraform apply` completes, never by a tenant. See TerraformApplyController.
 */
export class TerraformApplyWebhookDto {
  @ApiProperty({
    description: 'Outcome of the terraform apply run.',
    enum: TerraformApplyStatus,
    example: TerraformApplyStatus.SUCCESS,
  })
  @IsEnum(TerraformApplyStatus)
  status!: TerraformApplyStatus;

  @ApiProperty({
    description:
      'The commit sha that was applied, matched against the stored publication state to find ' +
      'the whitelist_entries rows this outcome covers.',
    format: 'git-sha',
    example: '3fa85f6457174562b3fc2c963f66afa6b3fc2c9',
  })
  @IsString()
  @Matches(/^[0-9a-f]{7,40}$/i)
  commitSha!: string;

  @ApiPropertyOptional({
    description: 'Failure reason, logged if present when status is "failure".',
    example: 'terraform apply exited with code 1',
  })
  @IsOptional()
  @IsString()
  error?: string;
}
