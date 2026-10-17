import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './config.js';
export const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === 'production' ? 5 : 12,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  }),
});
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
