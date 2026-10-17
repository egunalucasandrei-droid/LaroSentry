import { describe, expect, it } from 'vitest';
import { validateDeployment } from '../../apps/api/src/deployment-policy';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
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
  it('allows demo mode only for a matching dedicated loopback database and local origin', () => {
    const local = {
      ...env,
      NODE_ENV: 'development',
      PUBLIC_PILOT: '0',
      DEMO_MODE: 'true',
      APP_ORIGIN: 'http://127.0.0.1:5176',
      DATABASE_URL: 'postgresql://larosentry_app:test@127.0.0.1/larosentry_demo_1792000000000',
    };
    const marker = { LOCAL_DEMO_INSTANCE: 'larosentry_demo_1792000000000' };
    expect(() => validateDeployment(local, marker)).not.toThrow();
    for (const invalid of [
      { NODE_ENV: 'production' },
      { PUBLIC_PILOT: '1' },
      { APP_ORIGIN: 'https://example.com' },
      { DATABASE_URL: 'postgresql://larosentry_app:test@db.example.com/larosentry_demo_1792000000000' },
      { DATABASE_URL: 'postgresql://larosentry_app:test@127.0.0.1/larosentry' },
      { DATABASE_URL: 'postgresql://larosentry_app:test@127.0.0.1/larosentry_test_1792000000000' },
    ])
      expect(() => validateDeployment({ ...local, ...invalid }, marker)).toThrow(/DEMO_MODE/);
    expect(() => validateDeployment(local, {})).toThrow(/DEMO_MODE/);
    expect(() => validateDeployment(local, { ...marker, RENDER: 'true' })).toThrow(/DEMO_MODE/);
  });
  it('actual production config import refuses DEMO_MODE=true before application startup', () => {
    const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
    const run = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(requireApi.resolve('tsx')).href,
        '--input-type=module',
        '-e',
        "await import('./apps/api/src/config.ts')",
      ],
      {
        cwd: new URL('../../', import.meta.url),
        encoding: 'utf8',
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DEMO_MODE: 'true',
          PUBLIC_PILOT: '1',
          RENDER: 'true',
          APP_ORIGIN: env.APP_ORIGIN,
          RENDER_EXTERNAL_URL: env.APP_ORIGIN,
          DATABASE_URL: env.DATABASE_URL,
          DATA_KEY: '0'.repeat(64),
          EMAIL_PROVIDER: 'unavailable',
        },
      },
    );
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('DEMO_MODE requires');
  });
});
