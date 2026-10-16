import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
let root = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(root, 'pnpm-workspace.yaml')) && dirname(root) !== root) root = dirname(root);
config({ path: join(root, '.env'), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.url(),
  DATA_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  PORT: z.coerce.number().default(4000),
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default('LaroSentry <hello@larosentry.test>'),
});
export const env = schema.parse(process.env);
if (env.NODE_ENV === 'production') {
  if (!env.APP_ORIGIN.startsWith('https://')) throw new Error('Production requires HTTPS origin.');
  if (new URL(env.DATABASE_URL).username !== 'larosentry_app')
    throw new Error('Production requires the least-privilege runtime database role.');
  // Deployment is deliberately gated until remaining hardening has been reviewed.
  throw new Error('Production deployment is not enabled for this incomplete pilot; see docs/deployment.md.');
}
