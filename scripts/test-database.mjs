import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
const env = Object.fromEntries(
  (readFileSync('.env', 'utf8') + '\n' + readFileSync('.env.migrations', 'utf8'))
    .split(/\r?\n/)
    .filter((x) => x.includes('='))
    .map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]),
);
const schedulerBrowser = process.argv[2] === 'browser-scheduler';
const onboardingBrowser = process.argv[2] === 'browser-onboarding';
const demoVerification = process.argv[2] === 'demo-verification';
const name = `larosentry_${schedulerBrowser || demoVerification ? 'demo' : 'test'}_${Date.now()}`;
const psql = resolve('.tools/pgsql/bin/psql.exe');
const adminEnv = { ...process.env, PGPASSWORD: readFileSync('.local/pg-password', 'utf8').trim() };
function sql(database, text) {
  const result = spawnSync(
    psql,
    ['-h', '127.0.0.1', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'],
    { input: text, encoding: 'utf8', windowsHide: true, env: adminEnv },
  );
  if (result.status !== 0) throw new Error(result.stderr);
}
sql('postgres', `CREATE DATABASE ${name} OWNER larosentry_migrate;`);
sql(name, 'CREATE EXTENSION btree_gist;');
const runtime = new URL(env.DATABASE_URL),
  migration = new URL(env.MIGRATION_DATABASE_URL);
runtime.pathname = `/${name}`;
migration.pathname = `/${name}`;
const childEnv = {
  ...process.env,
  ...env,
  NODE_ENV: 'test',
  DEMO_MODE: 'false',
  SMS_PROVIDER: 'local',
  DATABASE_URL: runtime.toString(),
  MIGRATION_DATABASE_URL: migration.toString(),
};
writeFileSync('.local/last-test-database', name);
const pnpm = process.env.npm_execpath;
function run(args) {
  const result = spawnSync(process.execPath, [pnpm, ...args], {
    stdio: 'inherit',
    env: childEnv,
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Created separate PostgreSQL test database ${name}. Existing databases are untouched.`);
run(['--filter', '@larosentry/api', 'db:migrate']);
if (demoVerification) {
  const file = resolve(`.local/demo-verification-${name}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      Object.fromEntries(
        ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN'].map((role) => [
          role,
          randomBytes(24).toString('base64url'),
        ]),
      ),
    ),
    { mode: 0o600 },
  );
  Object.assign(childEnv, {
    LOCAL_DEMO_INSTANCE: name,
    LOCAL_DEMO_QUICK_ACCESS: '0',
    DEMO_PASSWORD_FILE: file,
    DEMO_VERIFICATION_TEST: '1',
    APP_ORIGIN: 'http://127.0.0.1:5173',
  });
  run(['--filter', '@larosentry/api', 'db:seed']);
  run(['--filter', '@larosentry/api', 'exec', 'tsx', 'src/demo-seed.ts']);
  for (const mode of ['true', 'false']) {
    childEnv.DEMO_MODE = mode;
    console.log(`Testing DEMO_MODE=${mode} in an isolated local database.`);
    run([
      '--filter',
      '@larosentry/api',
      'exec',
      'tsx',
      '--test',
      '--test-concurrency=1',
      'test/demo-mode.test.ts',
    ]);
  }
} else if (process.argv[2] !== 'browser-admin' && !schedulerBrowser && !onboardingBrowser) {
  run(['--filter', '@larosentry/api', 'test:integration']);
} else {
  Object.assign(childEnv, {
    PORT: '4010',
    APP_ORIGIN: 'http://127.0.0.1:5175',
    API_PROXY_TARGET: 'http://127.0.0.1:4010',
    BROWSER_BASE_URL: 'http://127.0.0.1:5175',
    ADMIN_E2E: '1',
    ...(onboardingBrowser ? { ONBOARDING_E2E: '1' } : {}),
    ...(schedulerBrowser
      ? { SCHEDULER_E2E: '1', LOCAL_DEMO_QUICK_ACCESS: '1', LOCAL_DEMO_INSTANCE: name }
      : {}),
  });
  run([
    '--filter',
    '@larosentry/api',
    'exec',
    'tsx',
    schedulerBrowser ? 'test/scheduler-browser-fixtures.ts' : 'test/admin-browser-fixtures.ts',
  ]);
  const requireApi = createRequire(resolve('apps/api/package.json'));
  const requireWeb = createRequire(resolve('apps/web/package.json'));
  const children = [];
  const start = (args, cwd) => {
    const child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: 'inherit', windowsHide: true });
    children.push(child);
    return child;
  };
  let apiProcess, webProcess;
  try {
    apiProcess = start(
      ['--import', pathToFileURL(requireApi.resolve('tsx')).href, 'src/main.ts'],
      resolve('apps/api'),
    );
    webProcess = start(
      [
        resolve(requireWeb.resolve('vite/package.json'), '../bin/vite.js'),
        '--host',
        '127.0.0.1',
        '--port',
        '5175',
        '--strictPort',
      ],
      resolve('apps/web'),
    );
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (apiProcess.exitCode !== null || webProcess.exitCode !== null)
        throw new Error('An isolated server exited. Check whether ports 4010 or 5175 are already occupied.');
      try {
        const result = await fetch('http://127.0.0.1:5175/api/health');
        if (result.ok) {
          ready = true;
          break;
        }
      } catch {
        /* wait for local startup */
      }
      await delay(500);
    }
    if (!ready) throw new Error('Isolated admin test servers did not become ready.');
    console.log('Admin browser tests use isolated database and local ports 5175/4010.');
    const result = spawnSync(
      process.execPath,
      [
        pnpm,
        'exec',
        'playwright',
        'test',
        schedulerBrowser
          ? 'tests/browser/scheduler.spec.ts'
          : onboardingBrowser
            ? 'tests/browser/onboarding.spec.ts'
            : 'tests/browser/admin.spec.ts',
      ],
      { stdio: 'inherit', env: childEnv, windowsHide: true },
    );
    process.exitCode = result.status ?? 1;
  } finally {
    for (const child of children) child.kill();
  }
}
