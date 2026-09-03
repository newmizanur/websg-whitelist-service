import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  PublishResult,
  WhitelistPublisher,
} from './whitelist-publisher.js';

export class NoopPublisher implements WhitelistPublisher {
  constructor(
    private readonly logger: Logger = new Logger(NoopPublisher.name),
  ) {}

  async publish(content: string): Promise<PublishResult> {
    this.logger.log(`Skipping real publish; would write:\n${content}`);
    return { commitSha: randomBytes(20).toString('hex') };
  }
}
