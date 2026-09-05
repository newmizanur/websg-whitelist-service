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
    const commitSha = randomBytes(20).toString('hex');
    this.logger.log(
      `Skipping real publish; would write:\n${content}\n\n` +
        `Fake commit sha: ${commitSha} — pass it as COMMIT_SHA to ` +
        `infra-reference/send-webhook.js to simulate a successful terraform apply.`,
    );
    return { commitSha };
  }
}
