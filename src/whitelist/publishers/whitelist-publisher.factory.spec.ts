import { describe, expect, it } from 'vitest';
import { GitHubPublisher } from './github.publisher.js';
import { NoopPublisher } from './noop.publisher.js';
import {
  GITHUB_BRANCH_ENV_VAR,
  GITHUB_OWNER_ENV_VAR,
  GITHUB_PATH_ENV_VAR,
  GITHUB_REPO_ENV_VAR,
  GITHUB_TOKEN_ENV_VAR,
  createWhitelistPublisher,
  resolveGitHubPublisherConfig,
} from './whitelist-publisher.factory.js';

const FULL_ENV = {
  [GITHUB_OWNER_ENV_VAR]: 'websg',
  [GITHUB_REPO_ENV_VAR]: 'infra',
  [GITHUB_TOKEN_ENV_VAR]: 'gh-token',
};

describe('resolveGitHubPublisherConfig', () => {
  it('returns undefined when owner, repo, or token is missing', () => {
    expect(resolveGitHubPublisherConfig({})).toBeUndefined();
    expect(
      resolveGitHubPublisherConfig({ [GITHUB_OWNER_ENV_VAR]: 'websg' }),
    ).toBeUndefined();
    expect(
      resolveGitHubPublisherConfig({
        [GITHUB_OWNER_ENV_VAR]: 'websg',
        [GITHUB_REPO_ENV_VAR]: 'infra',
      }),
    ).toBeUndefined();
  });

  it('returns a config with default path and branch when only the required vars are set', () => {
    expect(resolveGitHubPublisherConfig(FULL_ENV)).toEqual({
      owner: 'websg',
      repo: 'infra',
      token: 'gh-token',
      path: 'cms-whitelist/ip_whitelist.tfvars.json',
      branch: 'main',
    });
  });

  it('uses the path and branch overrides when provided', () => {
    const config = resolveGitHubPublisherConfig({
      ...FULL_ENV,
      [GITHUB_PATH_ENV_VAR]: 'custom/path.json',
      [GITHUB_BRANCH_ENV_VAR]: 'whitelist-updates',
    });

    expect(config?.path).toBe('custom/path.json');
    expect(config?.branch).toBe('whitelist-updates');
  });
});

describe('createWhitelistPublisher', () => {
  it('returns a NoopPublisher when GitHub config is incomplete', () => {
    const publisher = createWhitelistPublisher({});

    expect(publisher).toBeInstanceOf(NoopPublisher);
  });

  it('returns a GitHubPublisher when GitHub config is complete', () => {
    const publisher = createWhitelistPublisher(FULL_ENV);

    expect(publisher).toBeInstanceOf(GitHubPublisher);
  });
});
