import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createPrismaClient } from './db/client.ts';
import { createUnitOfWork } from './db/unit-of-work.ts';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54329/questionnaire';
const port = Number(process.env.PORT ?? 3000);
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

const prisma = createPrismaClient(databaseUrl);
const { app } = createApp({
  uow: createUnitOfWork(prisma),
  webDist: existsSync(webDist) ? webDist : undefined,
});

const server = serve({ fetch: app.fetch, port }, () => console.log(`API: http://localhost:${port}`));

// 終了するときは、処理中のリクエストを待ってから DB の接続を閉じる。
// keep-alive の接続が残ると close が終わらないので、待つ時間に上限を付ける
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  const finish = async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  const timer = setTimeout(finish, 10_000);
  timer.unref();
  server.close(() => {
    clearTimeout(timer);
    void finish();
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
