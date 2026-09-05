import type { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NoopPublisher } from './noop.publisher.js';

function makeLogger() {
  return { log: vi.fn() } as unknown as Logger;
}

describe('NoopPublisher', () => {
  it('logs the content it would have published', async () => {
    const logger = makeLogger();
    const publisher = new NoopPublisher(logger);

    await publisher.publish('{"cms_whitelist_ips":{}}');

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('{"cms_whitelist_ips":{}}'),
    );
  });

  it('resolves with a fake commit sha shaped like a real git sha', async () => {
    const publisher = new NoopPublisher(makeLogger());

    const result = await publisher.publish('content');

    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns a different fake sha on each call', async () => {
    const publisher = new NoopPublisher(makeLogger());

    const first = await publisher.publish('content');
    const second = await publisher.publish('content');

    expect(first.commitSha).not.toBe(second.commitSha);
  });

  it('logs the fake commit sha, so it can drive a manual webhook call without querying the DB', async () => {
    const logger = makeLogger();
    const publisher = new NoopPublisher(logger);

    const result = await publisher.publish('content');

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(result.commitSha),
    );
  });
});
