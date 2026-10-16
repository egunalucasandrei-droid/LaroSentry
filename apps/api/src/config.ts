import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { validateDeployment } from './deployment-policy.js';
let root = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(root, 'pnpm-workspace.yaml')) && dirname(root) !== root) root = dirname(root);
if (process.env.NODE_ENV !== 'production') config({ path: join(root, '.env'), quiet: true });
if (process.env.RENDER === 'true' && process.env.NODE_ENV === 'production')
  config({ path: '/etc/secrets/larosentry.env', quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.url(),
  DATA_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  PORT: z.coerce.number().default(4000),
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default('LaroSentry <hello@larosentry.test>'),
  EMAIL_PROVIDER: z.enum(['smtp', 'unavailable']).default('smtp'),
  PUBLIC_PILOT: z.enum(['0', '1']).default('0'),
});
export const env = schema.parse({
  ...process.env,
  APP_ORIGIN: process.env.APP_ORIGIN ?? process.env.RENDER_EXTERNAL_URL,
});
validateDeployment(env, {
  RENDER: process.env.RENDER,
  RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
  SMS_PROVIDER: process.env.SMS_PROVIDER,
  LOCAL_DEMO_QUICK_ACCESS: process.env.LOCAL_DEMO_QUICK_ACCESS,
});
export const workspaceRoot = root;
