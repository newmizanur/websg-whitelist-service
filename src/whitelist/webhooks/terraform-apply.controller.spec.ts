import { describe, expect, it, vi } from 'vitest';
import {
  TerraformApplyStatus,
  type TerraformApplyWebhookDto,
} from './terraform-apply.dto.js';
import { TerraformApplyController } from './terraform-apply.controller.js';
import type { TerraformApplyService } from './terraform-apply.service.js';

describe('TerraformApplyController', () => {
  it('delegates the payload to the service and acknowledges with ok', async () => {
    const service = {
      handle: vi.fn().mockResolvedValue(undefined),
    } as unknown as TerraformApplyService;
    const controller = new TerraformApplyController(service);
    const payload: TerraformApplyWebhookDto = {
      status: TerraformApplyStatus.SUCCESS,
      commitSha: 'abc1234',
    };

    const result = await controller.handleTerraformApply(payload);

    expect(service.handle).toHaveBeenCalledWith(payload);
    expect(result).toEqual({ status: 'ok' });
  });
});
