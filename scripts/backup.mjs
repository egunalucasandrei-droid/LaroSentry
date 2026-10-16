import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const env = Object.fromEntries(
  readFileSync('.env.migrations', 'utf8')
    .split(/\r?\n/)
    .filter((x) => x.includes('='))
    .map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]),
);
const url = new URL(env.MIGRATION_DATABASE_URL);
const args = ['-h', url.hostname, '-p', url.port || '5432', '-U', url.username];
const migrationEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const executable = (name) => (process.platform === 'win32' ? resolve(`.tools/pgsql/bin/${name}.exe`) : name);
function run(name, parameters, options = {}) {
  const result = spawnSync(executable(name), parameters, {
    encoding: 'utf8',
    windowsHide: true,
    env: migrationEnv,
    ...options,
  });
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr || result.error}`);
  return result.stdout;
}
mkdirSync('.local/backups', { recursive: true });
if (process.argv[2] === 'backup') {
  const file = resolve(`.local/backups/larosentry-${Date.now()}.dump`);
  run('pg_dump', [...args, '-d', url.pathname.slice(1), '-Fc', '-f', file]);
  writeFileSync('.local/last-backup', file);
  console.log(
    `Backup written to ${file}. Protect it together with the separate DATA_KEY; do not publish either.`,
  );
} else if (process.argv[2] === 'restore') {
  const file = process.argv[3] ? resolve(process.argv[3]) : readFileSync('.local/last-backup', 'utf8').trim();
  if (!existsSync(file)) throw new Error('Backup file not found.');
  const database = `larosentry_restore_test_${Date.now()}`;
  const adminEnv = { ...process.env, PGPASSWORD: readFileSync('.local/pg-password', 'utf8').trim() };
  run('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    env: adminEnv,
    input: `CREATE DATABASE ${database} OWNER larosentry_migrate;`,
  });
  run('pg_restore', [...args, '-d', database, '--exit-on-error', '--no-owner', file]);
  const check = run('psql', [...args, '-d', database, '-t', '-A', '-c', 'SELECT count(*) FROM "Facility";']);
  console.log(
    `Restored to NEW database ${database}; facilities=${check.trim()}. Existing databases untouched. No --clean or overwrite is used.`,
  );
  writeFileSync('.local/last-restore-database', database);
} else throw new Error('Usage: pnpm db:backup or pnpm db:restore:test [backup path].');
