import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  TerraformApplyStatus,
  TerraformApplyWebhookDto,
} from './terraform-apply.dto.js';

function makeDto(body: unknown) {
  return plainToInstance(TerraformApplyWebhookDto, body);
}

describe('TerraformApplyWebhookDto', () => {
  it('accepts a valid success payload', async () => {
    const dto = makeDto({ status: 'success', commitSha: 'abc1234' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts a valid failure payload with an error message', async () => {
    const dto = makeDto({
      status: 'failure',
      commitSha: 'abc1234',
      error: 'terraform apply exited with code 1',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts a failure payload without an error message', async () => {
    const dto = makeDto({ status: 'failure', commitSha: 'abc1234' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a status outside success/failure', async () => {
    const dto = makeDto({ status: 'pending', commitSha: 'abc1234' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects a missing status', async () => {
    const dto = makeDto({ commitSha: 'abc1234' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects a missing commitSha', async () => {
    const dto = makeDto({ status: 'success' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'commitSha')).toBe(true);
  });

  it('rejects a commitSha that is not a hex string', async () => {
    const dto = makeDto({ status: 'success', commitSha: 'not-a-sha!' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'commitSha')).toBe(true);
  });

  it('rejects a non-string error field', async () => {
    const dto = makeDto({ status: 'failure', commitSha: 'abc1234', error: 42 });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'error')).toBe(true);
  });

  it('exposes the expected status enum values', () => {
    expect(TerraformApplyStatus.SUCCESS).toBe('success');
    expect(TerraformApplyStatus.FAILURE).toBe('failure');
  });
});
