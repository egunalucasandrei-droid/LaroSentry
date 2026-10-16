import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';
config({ path: '../../.env.migrations', quiet: true });
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL },
});
