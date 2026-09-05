import type { ConfigType } from '@nestjs/config';
import type githubPublisherConfig from '../../config/github-publisher.config.js';
import {
  GitHubPublisher,
  type GitHubPublisherConfig,
} from './github.publisher.js';
import { NoopPublisher } from './noop.publisher.js';
import type { WhitelistPublisher } from './whitelist-publisher.js';

export function resolveGitHubPublisherConfig(
  config: ConfigType<typeof githubPublisherConfig>,
): GitHubPublisherConfig | undefined {
  const { owner, repo, token, path, branch } = config;

  if (!owner || !repo || !token) {
    return undefined;
  }

  return { owner, repo, token, path, branch };
}

/**
 * No GitHub config (e.g. local dev, or this exercise's lack of real repo
 * access — see system_design.md section 3a implementation note) falls back to
 * NoopPublisher rather than failing to boot.
 */
export function createWhitelistPublisher(
  config: ConfigType<typeof githubPublisherConfig>,
): WhitelistPublisher {
  const githubConfig = resolveGitHubPublisherConfig(config);
  return githubConfig ? new GitHubPublisher(githubConfig) : new NoopPublisher();
}
