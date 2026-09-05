import appConfig from './app.config.js';
import databaseConfig from './database.config.js';
import githubPublisherConfig from './github-publisher.config.js';
import webhookConfig from './webhook.config.js';

/**
 * Passed to ConfigModule.forRoot({ load }) identically by both entrypoints
 * (AppModule and WorkerModule) so every namespaced config token
 * (databaseConfig.KEY, etc.) resolves the same way regardless of which
 * process asks for it — a provider factory in a module either process
 * imports (e.g. WhitelistModule) can't otherwise assume which one loaded it.
 */
export const configFactories = [
  appConfig,
  databaseConfig,
  webhookConfig,
  githubPublisherConfig,
];

export { appConfig, databaseConfig, githubPublisherConfig, webhookConfig };
