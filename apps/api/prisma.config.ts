import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';
config({ path: '../../.env.migrations', quiet: true });
if (process.env.RENDER === 'true') config({ path: '/etc/secrets/larosentry.env', quiet: true });
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL },
});
