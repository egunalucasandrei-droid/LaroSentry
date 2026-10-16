import { describe, expect, it } from 'vitest';
import { validateDeployment } from '../../apps/api/src/deployment-policy';
const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://larosentry-test.onrender.com',
  DATABASE_URL: 'postgresql://larosentry_app:test@db/larosentry_pilot',
  PUBLIC_PILOT: '1',
  EMAIL_PROVIDER: 'unavailable',
};
const platform = { RENDER: 'true', RENDER_EXTERNAL_URL: env.APP_ORIGIN };
describe('public pilot deployment boundary', () => {
  it('permits the explicitly configured HTTPS Render pilot', () => {
    expect(() => validateDeployment(env, platform)).not.toThrow();
  });
  it('rejects general production, unsafe origins, database owners and local shortcuts', () => {
    for (const invalid of [
      { PUBLIC_PILOT: '0' },
      { APP_ORIGIN: 'http://larosentry-test.onrender.com' },
      { APP_ORIGIN: `${env.APP_ORIGIN}/path` },
      { EMAIL_PROVIDER: 'smtp' },
      { DATABASE_URL: 'postgresql://larosentry_migrate:test@db/larosentry_pilot' },
    ])
      expect(() => validateDeployment({ ...env, ...invalid }, platform)).toThrow();
    for (const invalid of [
      { RENDER: undefined },
      { RENDER_EXTERNAL_URL: 'https://other.onrender.com' },
      { SMS_PROVIDER: 'local' },
      { LOCAL_DEMO_QUICK_ACCESS: '1' },
    ])
      expect(() => validateDeployment(env, { ...platform, ...invalid })).toThrow();
  });
  it('preserves existing local development and test operation', () => {
    for (const NODE_ENV of ['development', 'test'])
      expect(() => validateDeployment({ ...env, NODE_ENV, PUBLIC_PILOT: '0' }, {})).not.toThrow();
  });
});
