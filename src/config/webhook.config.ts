import { registerAs } from '@nestjs/config';

export default registerAs('webhook', () => ({
  secret: process.env.WHITELIST_WEBHOOK_SECRET,
}));
