import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createPrismaClient } from './db/client.ts';
import { createUnitOfWork } from './db/unit-of-work.ts';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54329/questionnaire';
const port = Number(process.env.PORT ?? 3000);
const webDist = new URL('../../web/dist', import.meta.url).pathname;

const prisma = createPrismaClient(databaseUrl);
const { app } = createApp({
  uow: createUnitOfWork(prisma),
  webDist: existsSync(webDist) ? webDist : undefined,
});

const server = serve({ fetch: app.fetch, port }, () => console.log(`API: http://localhost:${port}`));

const shutdown = () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
