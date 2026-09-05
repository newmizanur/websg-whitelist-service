import { registerAs } from '@nestjs/config';

export default registerAs('githubPublisher', () => ({
  owner: process.env.WHITELIST_GITHUB_OWNER,
  repo: process.env.WHITELIST_GITHUB_REPO,
  token: process.env.WHITELIST_GITHUB_TOKEN,
  path: process.env.WHITELIST_GITHUB_PATH ?? 'cms-whitelist/ip_whitelist.tfvars.json',
  branch: process.env.WHITELIST_GITHUB_BRANCH ?? 'main',
}));
