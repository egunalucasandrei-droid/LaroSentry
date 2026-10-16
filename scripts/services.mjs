import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const bin = path.join(root, '.tools/pgsql/bin');
const data = path.join(root, '.local/pgdata');
const command = process.argv[2];
const run = (name, args, input, extraEnv = {}) => {
  const result = spawnSync(path.join(bin, `${name}.exe`), args, {
    input,
    encoding: 'utf8',
    windowsHide: true,
    ...(name === 'pg_ctl' ? { stdio: 'ignore' } : {}),
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr || result.error}`);
  return result.stdout;
};
if (process.platform !== 'win32' || !existsSync(bin))
  throw new Error(
    'Use docker compose -f infra/compose.yaml up -d, or follow docs/database.md for native PostgreSQL.',
  );
mkdirSync('.local', { recursive: true });
if (command === 'down') {
  run('pg_ctl', ['-D', data, 'stop', '-m', 'fast']);
  if (existsSync('.local/mailpit.pid')) {
    try {
      process.kill(Number(readFileSync('.local/mailpit.pid', 'utf8')));
    } catch {
      /* already stopped */
    }
  }
  console.log('Local services stopped.');
  process.exit(0);
}
if (!existsSync('.env')) {
  if (
    existsSync(path.join(data, 'PG_VERSION')) ||
    existsSync('.local/pg-password') ||
    existsSync('.env.migrations')
  )
    throw new Error(
      'Existing local database credentials were found. Restore the missing .env; initialization will not replace existing secrets.',
    );
  const admin = randomBytes(32).toString('hex');
  const migration = randomBytes(32).toString('hex');
  const runtime = randomBytes(32).toString('hex');
  writeFileSync('.local/pg-password', admin, { mode: 0o600 });
  writeFileSync(
    '.env',
    `NODE_ENV=development\nPORT=4000\nAPP_ORIGIN=http://127.0.0.1:5173\nDATABASE_URL=postgresql://larosentry_app:${runtime}@127.0.0.1:5432/larosentry\nDATA_KEY=${randomBytes(32).toString('hex')}\nSMTP_HOST=127.0.0.1\nSMTP_PORT=1025\nMAIL_FROM=LaroSentry <hello@larosentry.test>\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    '.env.migrations',
    `MIGRATION_DATABASE_URL=postgresql://larosentry_migrate:${migration}@127.0.0.1:5432/larosentry\n`,
    { mode: 0o600 },
  );
}
if (!existsSync(path.join(data, 'PG_VERSION'))) {
  if (!existsSync('.local/pg-password'))
    throw new Error(
      'Existing .env requires manual native database configuration; no credentials will be replaced.',
    );
  run('initdb', [
    '-D',
    data,
    '-U',
    'postgres',
    '-A',
    'scram-sha-256',
    '--pwfile',
    path.join(root, '.local/pg-password'),
    '-E',
    'UTF8',
    '--locale=C',
  ]);
}
const status = spawnSync(path.join(bin, 'pg_ctl.exe'), ['-D', data, 'status'], {
  encoding: 'utf8',
  windowsHide: true,
});
if (status.status !== 0)
  run('pg_ctl', [
    '-D',
    data,
    '-l',
    path.join(root, '.local/postgres.log'),
    '-o',
    '-h 127.0.0.1 -p 5432',
    'start',
    '-w',
  ]);
if (!existsSync('.local/database-created')) {
  const env = Object.fromEntries(
    (readFileSync('.env', 'utf8') + '\n' + readFileSync('.env.migrations', 'utf8'))
      .split(/\r?\n/)
      .filter((x) => x.includes('='))
      .map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]),
  );
  const migration = new URL(env.MIGRATION_DATABASE_URL),
    runtime = new URL(env.DATABASE_URL);
  const adminEnv = { PGPASSWORD: readFileSync('.local/pg-password', 'utf8').trim() };
  const args = ['-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  run(
    'psql',
    args,
    `CREATE ROLE larosentry_migrate LOGIN PASSWORD '${migration.password}';\nCREATE ROLE larosentry_app LOGIN PASSWORD '${runtime.password}';\nCREATE DATABASE larosentry OWNER larosentry_migrate;\n`,
    adminEnv,
  );
  run(
    'psql',
    ['-h', '127.0.0.1', '-U', 'postgres', '-d', 'larosentry', '-v', 'ON_ERROR_STOP=1'],
    'CREATE EXTENSION IF NOT EXISTS btree_gist; REVOKE CREATE ON SCHEMA public FROM PUBLIC;',
    adminEnv,
  );
  writeFileSync(
    '.local/database-created',
    'Native local database initialized. Do not delete this marker to reset the database.',
  );
}
let mailRunning = false;
if (existsSync('.local/mailpit.pid')) {
  try {
    process.kill(Number(readFileSync('.local/mailpit.pid', 'utf8')), 0);
    mailRunning = true;
  } catch {
    /* no process */
  }
}
if (!mailRunning) {
  const mail = spawn(
    path.join(root, '.tools/mailpit/mailpit.exe'),
    [
      '--listen',
      '127.0.0.1:8025',
      '--smtp',
      '127.0.0.1:1025',
      '--database',
      path.join(root, '.local/mailpit.db'),
    ],
    { detached: true, stdio: 'ignore', windowsHide: true },
  );
  mail.unref();
  writeFileSync('.local/mailpit.pid', String(mail.pid));
}
console.log(
  'PostgreSQL: 127.0.0.1:5432. Mailpit: http://127.0.0.1:8025. Secrets saved only to ignored local files.',
);
