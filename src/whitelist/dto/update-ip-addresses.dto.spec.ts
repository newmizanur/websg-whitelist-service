import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRIES_PER_REQUEST,
  UpdateIpAddressesDto,
} from './update-ip-addresses.dto.js';

function makeDto(body: unknown) {
  return plainToInstance(UpdateIpAddressesDto, body);
}

describe('UpdateIpAddressesDto', () => {
  it('accepts a valid request with add and remove arrays', async () => {
    const dto = makeDto({
      add: ['1.1.1.1', '8.8.8.0/24'],
      remove: ['9.9.9.9'],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts empty add and remove arrays', async () => {
    const dto = makeDto({ add: [], remove: [] });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects when add is missing', async () => {
    const dto = makeDto({ remove: [] });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'add')).toBe(true);
  });

  it('rejects when remove is missing', async () => {
    const dto = makeDto({ add: [] });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'remove')).toBe(true);
  });

  it('rejects an invalid entry in add', async () => {
    const dto = makeDto({ add: ['not-an-ip'], remove: [] });

    const errors = await validate(dto);

    const addError = errors.find((e) => e.property === 'add');
    expect(addError?.constraints).toHaveProperty('isWhitelistIpAddress');
  });

  it('names only the invalid entries in the error message, not the whole array', async () => {
    const dto = makeDto({
      add: ['1.1.1.1', 'not-an-ip', '8.8.8.0/24'],
      remove: [],
    });

    const errors = await validate(dto);

    const addError = errors.find((e) => e.property === 'add');
    const message = addError?.constraints?.isWhitelistIpAddress ?? '';
    expect(message).toContain('not-an-ip');
    expect(message).not.toContain('1.1.1.1');
    expect(message).not.toContain('8.8.8.0/24');
  });

  it('accepts a canonical CIDR range', async () => {
    const dto = makeDto({ add: ['1.1.1.0/24'], remove: [] });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-canonical CIDR with a clear "did you mean" message', async () => {
    const dto = makeDto({ add: ['1.1.1.1/24'], remove: [] });

    const errors = await validate(dto);

    const addError = errors.find((e) => e.property === 'add');
    const message = addError?.constraints?.isWhitelistIpAddress ?? '';
    expect(message).toContain(
      '1.1.1.1/24 is invalid; did you mean 1.1.1.0/24?',
    );
  });

  it('accepts a /32 CIDR (host bits are the whole address, always canonical)', async () => {
    const dto = makeDto({ add: ['8.8.8.8/32'], remove: [] });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a private-range entry in remove', async () => {
    const dto = makeDto({ add: [], remove: ['192.168.1.1'] });

    const errors = await validate(dto);

    const removeError = errors.find((e) => e.property === 'remove');
    expect(removeError?.constraints).toHaveProperty('isWhitelistIpAddress');
  });

  it('rejects duplicate entries within add', async () => {
    const dto = makeDto({ add: ['1.1.1.1', '1.1.1.1'], remove: [] });

    const errors = await validate(dto);

    const addError = errors.find((e) => e.property === 'add');
    expect(addError?.constraints).toHaveProperty('arrayUnique');
  });

  it('rejects duplicate entries within remove', async () => {
    const dto = makeDto({ add: [], remove: ['1.1.1.1', '1.1.1.1'] });

    const errors = await validate(dto);

    const removeError = errors.find((e) => e.property === 'remove');
    expect(removeError?.constraints).toHaveProperty('arrayUnique');
  });

  it(`accepts exactly ${MAX_ENTRIES_PER_REQUEST} combined entries`, async () => {
    const add = Array.from({ length: 30 }, (_, i) => `1.1.0.${i}`);
    const remove = Array.from(
      { length: MAX_ENTRIES_PER_REQUEST - add.length },
      (_, i) => `2.2.0.${i}`,
    );
    const dto = makeDto({ add, remove });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it(`rejects more than ${MAX_ENTRIES_PER_REQUEST} combined entries across add and remove`, async () => {
    const add = Array.from({ length: 30 }, (_, i) => `1.1.0.${i}`);
    const remove = Array.from(
      { length: MAX_ENTRIES_PER_REQUEST - add.length + 1 },
      (_, i) => `2.2.0.${i}`,
    );
    const dto = makeDto({ add, remove });

    const errors = await validate(dto);

    expect(
      errors.some(
        (e) => e.constraints && 'maxTotalWhitelistEntries' in e.constraints,
      ),
    ).toBe(true);
  });

  it('rejects a single array exceeding the max size on its own', async () => {
    const add = Array.from(
      { length: MAX_ENTRIES_PER_REQUEST + 1 },
      (_, i) => `1.1.0.${i}`,
    );
    const dto = makeDto({ add, remove: [] });

    const errors = await validate(dto);

    const addError = errors.find((e) => e.property === 'add');
    expect(addError?.constraints).toHaveProperty('arrayMaxSize');
  });
});
