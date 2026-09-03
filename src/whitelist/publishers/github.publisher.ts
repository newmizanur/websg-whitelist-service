import type {
  PublishResult,
  WhitelistPublisher,
} from './whitelist-publisher.js';

const GITHUB_API_VERSION = '2022-11-28';

export interface GitHubPublisherConfig {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  token: string;
  commitMessage?: string;
  fetchImpl?: typeof fetch;
}

interface GitHubContentsGetResponse {
  sha: string;
}

interface GitHubContentsPutResponse {
  commit: { sha: string };
}

export class GitHubPublisher implements WhitelistPublisher {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: GitHubPublisherConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async publish(content: string): Promise<PublishResult> {
    const sha = await this.getCurrentFileSha();

    const response = await this.fetchImpl(this.contentsUrl(), {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({
        message: this.config.commitMessage ?? 'chore: update CMS whitelist',
        content: Buffer.from(content, 'utf-8').toString('base64'),
        branch: this.config.branch,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub Contents API update failed with status ${response.status}`,
      );
    }

    const body = (await response.json()) as GitHubContentsPutResponse;
    return { commitSha: body.commit.sha };
  }

  private async getCurrentFileSha(): Promise<string | undefined> {
    const response = await this.fetchImpl(
      `${this.contentsUrl()}?ref=${encodeURIComponent(this.config.branch)}`,
      {
        method: 'GET',
        headers: this.headers(),
      },
    );

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      throw new Error(
        `GitHub Contents API lookup failed with status ${response.status}`,
      );
    }

    const body = (await response.json()) as GitHubContentsGetResponse;
    return body.sha;
  }

  private contentsUrl(): string {
    return `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${this.config.path}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    };
  }
}
