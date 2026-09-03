import { describe, expect, it, vi } from 'vitest';
import { GitHubPublisher } from './github.publisher.js';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function makeConfig(fetchImpl: typeof fetch) {
  return {
    owner: 'websg',
    repo: 'infra',
    path: 'cms-whitelist/ip_whitelist.tfvars.json',
    branch: 'main',
    token: 'gh-token',
    fetchImpl,
  };
}

describe('GitHubPublisher', () => {
  it('looks up the current file sha, then updates it with that sha for optimistic concurrency', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { sha: 'existing-sha' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { commit: { sha: 'new-commit-sha' } }),
      );
    const publisher = new GitHubPublisher(
      makeConfig(fetchImpl as unknown as typeof fetch),
    );

    const result = await publisher.publish('{"cms_whitelist_ips":{}}');

    expect(result).toEqual({ commitSha: 'new-commit-sha' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [getUrl, getOptions] = fetchImpl.mock.calls[0];
    expect(getUrl).toBe(
      'https://api.github.com/repos/websg/infra/contents/cms-whitelist/ip_whitelist.tfvars.json?ref=main',
    );
    expect(getOptions.method).toBe('GET');

    const [putUrl, putOptions] = fetchImpl.mock.calls[1];
    expect(putUrl).toBe(
      'https://api.github.com/repos/websg/infra/contents/cms-whitelist/ip_whitelist.tfvars.json',
    );
    expect(putOptions.method).toBe('PUT');
    const putBody = JSON.parse(putOptions.body as string);
    expect(putBody.sha).toBe('existing-sha');
    expect(putBody.branch).toBe('main');
    expect(Buffer.from(putBody.content, 'base64').toString('utf-8')).toBe(
      '{"cms_whitelist_ips":{}}',
    );
  });

  it('creates the file without a sha when it does not exist yet', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(
        jsonResponse(201, { commit: { sha: 'first-commit-sha' } }),
      );
    const publisher = new GitHubPublisher(
      makeConfig(fetchImpl as unknown as typeof fetch),
    );

    const result = await publisher.publish('{"cms_whitelist_ips":{}}');

    expect(result).toEqual({ commitSha: 'first-commit-sha' });
    const putBody = JSON.parse(fetchImpl.mock.calls[1][1].body as string);
    expect(putBody.sha).toBeUndefined();
  });

  it('throws when the sha lookup fails for a reason other than not-found', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }));
    const publisher = new GitHubPublisher(
      makeConfig(fetchImpl as unknown as typeof fetch),
    );

    await expect(publisher.publish('content')).rejects.toThrow(/500/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws when the update request fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { sha: 'existing-sha' }))
      .mockResolvedValueOnce(jsonResponse(422, { message: 'invalid' }));
    const publisher = new GitHubPublisher(
      makeConfig(fetchImpl as unknown as typeof fetch),
    );

    await expect(publisher.publish('content')).rejects.toThrow(/422/);
  });

  it('sends bearer auth and does not leak the token in the URL', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { sha: 'existing-sha' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { commit: { sha: 'new-commit-sha' } }),
      );
    const publisher = new GitHubPublisher(
      makeConfig(fetchImpl as unknown as typeof fetch),
    );

    await publisher.publish('content');

    for (const call of fetchImpl.mock.calls) {
      const [url, options] = call;
      expect(url as string).not.toContain('gh-token');
      expect((options.headers as Record<string, string>).Authorization).toBe(
        'Bearer gh-token',
      );
    }
  });
});
