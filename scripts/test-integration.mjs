import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Set TEST_DATABASE_URL to a dedicated integration-test database.');
}

let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch {
  throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL connection URL.');
}

const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)
  || !/^degems_test_[a-z0-9_]+$/.test(databaseName)) {
  throw new Error('Integration tests require a PostgreSQL database named degems_test_<suffix>.');
}

const environment = { ...process.env, DATABASE_URL: databaseUrl };
const commands = [
  ['prisma', ['migrate', 'deploy']],
  ['vitest', ['run', 'tests/integration']],
];

for (const [command, arguments_] of commands) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  const result = spawnSync(executable, arguments_, { env: environment, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
