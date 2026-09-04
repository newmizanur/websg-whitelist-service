import {
  GitHubPublisher,
  type GitHubPublisherConfig,
} from './github.publisher.js';
import { NoopPublisher } from './noop.publisher.js';
import type { WhitelistPublisher } from './whitelist-publisher.js';

export const GITHUB_OWNER_ENV_VAR = 'WHITELIST_GITHUB_OWNER';
export const GITHUB_REPO_ENV_VAR = 'WHITELIST_GITHUB_REPO';
export const GITHUB_PATH_ENV_VAR = 'WHITELIST_GITHUB_PATH';
export const GITHUB_BRANCH_ENV_VAR = 'WHITELIST_GITHUB_BRANCH';
export const GITHUB_TOKEN_ENV_VAR = 'WHITELIST_GITHUB_TOKEN';

const DEFAULT_GITHUB_PATH = 'cms-whitelist/ip_whitelist.tfvars.json';
const DEFAULT_GITHUB_BRANCH = 'main';

export function resolveGitHubPublisherConfig(
  env: Record<string, string | undefined> = process.env,
): GitHubPublisherConfig | undefined {
  const owner = env[GITHUB_OWNER_ENV_VAR];
  const repo = env[GITHUB_REPO_ENV_VAR];
  const token = env[GITHUB_TOKEN_ENV_VAR];

  if (!owner || !repo || !token) {
    return undefined;
  }

  return {
    owner,
    repo,
    token,
    path: env[GITHUB_PATH_ENV_VAR] ?? DEFAULT_GITHUB_PATH,
    branch: env[GITHUB_BRANCH_ENV_VAR] ?? DEFAULT_GITHUB_BRANCH,
  };
}

/**
 * No GitHub config (e.g. local dev, or this exercise's lack of real repo
 * access — see system_design.md section 3a implementation note) falls back to
 * NoopPublisher rather than failing to boot.
 */
export function createWhitelistPublisher(
  env: Record<string, string | undefined> = process.env,
): WhitelistPublisher {
  const githubConfig = resolveGitHubPublisherConfig(env);
  return githubConfig ? new GitHubPublisher(githubConfig) : new NoopPublisher();
}
