import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
console.log(`Node ${process.version}; ${process.platform}; workspace ${process.cwd()}`);
for (const name of ['git', 'docker', 'psql']) {
  const result = spawnSync(name, ['--version'], { encoding: 'utf8', windowsHide: true });
  console.log(`${name}: ${result.status === 0 ? result.stdout.trim() : 'not in PATH'}`);
}
console.log(
  `Local PostgreSQL: ${existsSync('.tools/pgsql/bin/pg_ctl.exe')}; Mailpit: ${existsSync('.tools/mailpit/mailpit.exe')}`,
);
if (process.version !== 'v24.21.0') process.exitCode = 1;
