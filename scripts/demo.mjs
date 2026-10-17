import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const demoPortOccupied = (port) =>
  new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (value) => {
      socket.destroy();
      done(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1500, () => finish(true));
  });

const command = process.argv[2];
if (command === 'scenarios' && (process.env.RENDER === 'true' || process.env.PUBLIC_PILOT === '1'))
  throw new Error('Presentation scenarios are refused on Render/public pilot environments.');
if (!['setup', 'start', 'scenarios'].includes(command) || process.env.NODE_ENV === 'production')
  throw new Error('Use demo:setup, demo:start or demo:scenarios locally. Production is refused.');
const config = Object.fromEntries(
  (readFileSync('.env', 'utf8') + '\n' + readFileSync('.env.migrations', 'utf8'))
    .split(/\r?\n/)
    .filter((x) => x.includes('='))
    .map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]),
);
if (config.NODE_ENV === 'production') throw new Error('Production configuration is refused.');
const demoMode = process.env.DEMO_MODE ?? config.DEMO_MODE ?? 'false';
if (!['true', 'false'].includes(demoMode)) throw new Error('DEMO_MODE must be true or false.');
const runtime = new URL(config.DATABASE_URL),
  migration = new URL(config.MIGRATION_DATABASE_URL);
for (const url of [runtime, migration]) {
  if (url.hostname !== '127.0.0.1' || (url.port && url.port !== '5432'))
    throw new Error('Only local PostgreSQL at 127.0.0.1:5432 is supported.');
}
const marker = '.local/demo-database.json';
let name;
if (command === 'setup') name = `larosentry_demo_${Date.now()}`;
else {
  const saved = JSON.parse(readFileSync(marker, 'utf8'));
  if (saved.kind !== 'LAROSENTRY_LOCAL_DEMO_V1') throw new Error('Unrecognized demo marker.');
  name = saved.name;
}
if (!/^larosentry_demo_\d{13}$/.test(name)) throw new Error('Unrecognized database name.');
runtime.pathname = `/${name}`;
migration.pathname = `/${name}`;
const childEnv = {
  ...process.env,
  ...config,
  NODE_ENV: 'development',
  DATABASE_URL: runtime.href,
  MIGRATION_DATABASE_URL: migration.href,
  APP_ORIGIN: 'http://127.0.0.1:5176',
  PORT: '4011',
  API_PROXY_TARGET: 'http://127.0.0.1:4011',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  LOCAL_DEMO_INSTANCE: name,
  DEMO_MODE: demoMode,
  LOCAL_DEMO_QUICK_ACCESS:
    demoMode === 'true'
      ? '0'
      : (process.env.LOCAL_DEMO_QUICK_ACCESS ?? config.LOCAL_DEMO_QUICK_ACCESS ?? '0'),
  SMS_PROVIDER: 'local',
};
const pnpm = process.env.npm_execpath;
function run(args) {
  const result = spawnSync(process.execPath, [pnpm, ...args], {
    env: childEnv,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Demo command failed; existing databases are preserved.');
}
if (command === 'scenarios') {
  run(['--filter', '@larosentry/api', 'exec', 'tsx', 'src/presentation-seed.ts']);
} else if (command === 'setup') {
  if ((await Promise.all([5176, 4011].map(demoPortOccupied))).some(Boolean)) {
    console.error(
      'Demo setup refused: a demo server is still running. To use existing accounts, open http://127.0.0.1:5176/login. To create a fresh demo, stop the serving terminal with Ctrl+C first. No database or password was changed.',
    );
    process.exit(1);
  }
  const passwordPath = resolve(process.env.DEMO_PASSWORD_FILE || '.local/demo-passwords.json');
  if (!existsSync(passwordPath)) {
    if (process.env.DEMO_PASSWORD_FILE) throw new Error('Configured password file does not exist.');
    writeFileSync(
      passwordPath,
      JSON.stringify(
        Object.fromEntries(
          ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN'].map((role) => [
            role,
            randomBytes(24).toString('base64url'),
          ]),
        ),
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
  if (process.platform === 'win32' && !process.env.DEMO_PASSWORD_FILE) {
    const identity = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    const acl = spawnSync('icacls.exe', [passwordPath, '/inheritance:r', '/grant:r', `${identity}:(F)`], {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (acl.status !== 0)
      throw new Error('Could not restrict demo password file access to the current Windows account.');
  }
  const passwords = JSON.parse(readFileSync(passwordPath, 'utf8'));
  if (
    ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN'].some(
      (role) =>
        typeof passwords[role] !== 'string' || passwords[role].length < 12 || passwords[role].length > 128,
    )
  )
    throw new Error('All four local passwords must contain 12–128 characters.');
  childEnv.DEMO_PASSWORD_FILE = passwordPath;
  const sql = (database, input) => {
    const result = spawnSync(
      resolve('.tools/pgsql/bin/psql.exe'),
      ['-h', '127.0.0.1', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'],
      {
        input,
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, PGPASSWORD: readFileSync('.local/pg-password', 'utf8').trim() },
      },
    );
    if (result.status !== 0) throw new Error('Local demo database creation failed. No database was reset.');
  };
  sql('postgres', `CREATE DATABASE ${name} OWNER larosentry_migrate;`);
  sql(name, 'CREATE EXTENSION btree_gist;');
  run(['--filter', '@larosentry/api', 'db:migrate']);
  run(['--filter', '@larosentry/api', 'db:seed']);
  run(['--filter', '@larosentry/api', 'exec', 'tsx', 'src/demo-seed.ts']);
  writeFileSync(marker, JSON.stringify({ kind: 'LAROSENTRY_LOCAL_DEMO_V1', name }, null, 2));
  console.log(
    `Dedicated demo ${name} prepared. Existing databases untouched. Passwords: ${passwordPath}. Run pnpm demo:start.`,
  );
} else {
  const occupied = (port) =>
    new Promise((done) => {
      const socket = createConnection({ host: '127.0.0.1', port });
      const finish = (value) => {
        socket.destroy();
        done(value);
      };
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.setTimeout(1500, () => finish(true));
    });
  const healthy = async (port) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: globalThis.AbortSignal.timeout(2000),
      });
      const body = await response.json();
      return (
        response.ok &&
        body.status === 'ok' &&
        body.database === 'connected' &&
        body.demoInstance === name &&
        body.demoMode === (demoMode === 'true')
      );
    } catch {
      return false;
    }
  };
  const ports = await Promise.all([5176, 4011].map(occupied));
  if (ports.some(Boolean)) {
    if (ports.every(Boolean) && (await Promise.all([5176, 4011].map(healthy))).every(Boolean)) {
      console.log(
        `LaroSentry demo is already running with DEMO_MODE=${demoMode}. Open http://127.0.0.1:5176/login. No second server was started.`,
      );
      process.exit(0);
    }
    console.error(
      'Demo startup stopped safely: port 5176 or 4011 is occupied, but the selected demo is not healthy. Close the previous demo terminal with Ctrl+C, then run pnpm demo:start again. No existing process or database was changed.',
    );
    process.exit(1);
  }
  // A restart after Windows shutdown should bring dependencies back too.
  run(['services:up']);
  run(['--filter', '@larosentry/api', 'db:migrate']);
  run(['--filter', '@larosentry/api', 'exec', 'tsx', 'src/demo-prepare.ts']);
  const api = createRequire(resolve('apps/api/package.json')),
    web = createRequire(resolve('apps/web/package.json'));
  const children = [];
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill();
  };
  const startChild = (args, cwd) => {
    const child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: 'inherit', windowsHide: true });
    children.push(child);
    child.on('error', () => {
      console.error('A demo process could not start.');
      process.exitCode = 1;
      stop();
    });
    child.on('exit', (code) => {
      if (!stopping) {
        process.exitCode = code || 1;
        console.error('A demo process stopped. Restart with pnpm demo:start.');
      }
      stop();
    });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  startChild(['--import', pathToFileURL(api.resolve('tsx')).href, 'src/main.ts'], resolve('apps/api'));
  let apiReady = false;
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    if (await healthy(4011)) {
      apiReady = true;
      break;
    }
    await delay(500);
  }
  if (apiReady && !stopping) {
    startChild(
      [
        resolve(web.resolve('vite/package.json'), '../bin/vite.js'),
        '--host',
        '127.0.0.1',
        '--port',
        '5176',
        '--strictPort',
      ],
      resolve('apps/web'),
    );
  } else if (!stopping) {
    console.error('The API did not become ready. The website was not started.');
    process.exitCode = 1;
    stop();
  }
  let ready = false;
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    if ((await healthy(4011)) && (await healthy(5176))) {
      ready = true;
      break;
    }
    await delay(500);
  }
  if (ready)
    console.log(
      `LOCAL FICTIONAL DEMO READY: ${name}\nDEMO_MODE=${demoMode}\nOpen http://127.0.0.1:5176/login\nKeep this terminal open. Repeating demo:start with the same mode safely reuses this demo. Mail: http://127.0.0.1:8025.`,
    );
  else if (!stopping) {
    console.error('The demo did not become ready. Check the service errors above and restart.');
    process.exitCode = 1;
    stop();
  }
}
