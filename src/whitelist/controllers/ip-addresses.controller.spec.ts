import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ENTRIES_PER_REQUEST,
  UpdateIpAddressesDto,
} from '../dto/update-ip-addresses.dto.js';
import { WhitelistEntryStatus } from '../entities/whitelist-entry.entity.js';
import type {
  IpAddressesService,
  RequestStatusResult,
} from '../services/ip-addresses.service.js';
import { IpAddressesController } from './ip-addresses.controller.js';

function makeDto(add: string[], remove: string[]): UpdateIpAddressesDto {
  return Object.assign(new UpdateIpAddressesDto(), { add, remove });
}

describe('IpAddressesController', () => {
  describe('submit', () => {
    it('returns a 202-shaped body with the requestId, queued status, and statusUrl', async () => {
      const service = {
        submit: vi.fn().mockResolvedValue({ requestId: 'wl_abc123' }),
      } as unknown as IpAddressesService;
      const controller = new IpAddressesController(service);
      const dto = makeDto(['203.0.113.5'], []);

      const result = await controller.submit('tenant_123', dto);

      expect(service.submit).toHaveBeenCalledWith('tenant_123', dto);
      expect(result).toEqual({
        requestId: 'wl_abc123',
        status: 'queued',
        statusUrl: '/api/whitelist/requests/wl_abc123',
      });
    });
  });

  describe('getStatus', () => {
    it.each([
      WhitelistEntryStatus.QUEUED,
      WhitelistEntryStatus.COMMITTED,
      WhitelistEntryStatus.APPLIED,
      WhitelistEntryStatus.FAILED,
    ])(
      'passes through the service result for an add entry in status %s',
      async (status) => {
        const requestStatus: RequestStatusResult = {
          requestId: 'wl_abc123',
          status: status === WhitelistEntryStatus.FAILED ? 'failed' : 'pending',
          submittedBy: 'tenant_123',
          entries: [{ ip: '203.0.113.5', action: 'add', status }],
        };
        const service = {
          getRequestStatus: vi.fn().mockResolvedValue(requestStatus),
        } as unknown as IpAddressesService;
        const controller = new IpAddressesController(service);

        const result = await controller.getStatus('tenant_123', 'wl_abc123');

        expect(service.getRequestStatus).toHaveBeenCalledWith(
          'tenant_123',
          'wl_abc123',
        );
        expect(result).toBe(requestStatus);
      },
    );

    it('throws NotFoundException when the service finds no matching request', async () => {
      const service = {
        getRequestStatus: vi.fn().mockResolvedValue(undefined),
      } as unknown as IpAddressesService;
      const controller = new IpAddressesController(service);

      await expect(
        controller.getStatus('tenant_123', 'wl_unknown'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('request validation (ValidationPipe + UpdateIpAddressesDto)', () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const metadata = {
      type: 'body' as const,
      metatype: UpdateIpAddressesDto,
      data: '',
    };

    it('rejects a request exceeding MAX_ENTRIES_PER_REQUEST combined entries', async () => {
      const add = Array.from(
        { length: MAX_ENTRIES_PER_REQUEST + 1 },
        (_, i) => `1.1.0.${i}`,
      );

      await expect(
        pipe.transform({ add, remove: [] }, metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate entries within the add array', async () => {
      await expect(
        pipe.transform({ add: ['1.1.1.1', '1.1.1.1'], remove: [] }, metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a well-formed request within limits', async () => {
      const result = await pipe.transform(
        { add: ['1.1.1.1'], remove: ['2.2.2.2'] },
        metadata,
      );

      expect(result).toBeInstanceOf(UpdateIpAddressesDto);
    });
  });
});
