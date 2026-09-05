import { describe, expect, it } from 'vitest';
import { GitHubPublisher } from './github.publisher.js';
import { NoopPublisher } from './noop.publisher.js';
import {
  createWhitelistPublisher,
  resolveGitHubPublisherConfig,
} from './whitelist-publisher.factory.js';

const FULL_CONFIG = {
  owner: 'websg',
  repo: 'infra',
  token: 'gh-token',
  path: 'cms-whitelist/ip_whitelist.tfvars.json',
  branch: 'main',
};

describe('resolveGitHubPublisherConfig', () => {
  it('returns undefined when owner, repo, or token is missing', () => {
    expect(
      resolveGitHubPublisherConfig({
        owner: undefined,
        repo: undefined,
        token: undefined,
        path: 'cms-whitelist/ip_whitelist.tfvars.json',
        branch: 'main',
      }),
    ).toBeUndefined();
    expect(
      resolveGitHubPublisherConfig({
        owner: 'websg',
        repo: undefined,
        token: undefined,
        path: 'cms-whitelist/ip_whitelist.tfvars.json',
        branch: 'main',
      }),
    ).toBeUndefined();
    expect(
      resolveGitHubPublisherConfig({
        owner: 'websg',
        repo: 'infra',
        token: undefined,
        path: 'cms-whitelist/ip_whitelist.tfvars.json',
        branch: 'main',
      }),
    ).toBeUndefined();
  });

  it('returns a config with default path and branch when only the required vars are set', () => {
    expect(resolveGitHubPublisherConfig(FULL_CONFIG)).toEqual(FULL_CONFIG);
  });

  it('uses the path and branch overrides when provided', () => {
    const config = resolveGitHubPublisherConfig({
      ...FULL_CONFIG,
      path: 'custom/path.json',
      branch: 'whitelist-updates',
    });

    expect(config?.path).toBe('custom/path.json');
    expect(config?.branch).toBe('whitelist-updates');
  });
});

describe('createWhitelistPublisher', () => {
  it('returns a NoopPublisher when GitHub config is incomplete', () => {
    const publisher = createWhitelistPublisher({
      owner: undefined,
      repo: undefined,
      token: undefined,
      path: 'cms-whitelist/ip_whitelist.tfvars.json',
      branch: 'main',
    });

    expect(publisher).toBeInstanceOf(NoopPublisher);
  });

  it('returns a GitHubPublisher when GitHub config is complete', () => {
    const publisher = createWhitelistPublisher(FULL_CONFIG);

    expect(publisher).toBeInstanceOf(GitHubPublisher);
  });
});
