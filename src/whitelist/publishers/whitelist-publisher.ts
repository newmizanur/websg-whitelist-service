export interface PublishResult {
  commitSha: string;
}

export interface WhitelistPublisher {
  publish(content: string): Promise<PublishResult>;
}
