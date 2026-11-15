// 開発用の PostgreSQL をこのコンテナの中で起動する(データは apps/api/.pgdata)。Ctrl+C で止める。
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const databaseDir = fileURLToPath(new URL('../.pgdata', import.meta.url));
const initialized = existsSync(`${databaseDir}/PG_VERSION`);
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port: 54329,
  persistent: true,
  onLog: () => {},
});

if (!initialized) await pg.initialise();
await pg.start();
if (!initialized) await pg.createDatabase('questionnaire');
console.log('PostgreSQL: postgresql://postgres:postgres@localhost:54329/questionnaire');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
