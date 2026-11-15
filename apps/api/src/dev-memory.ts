// DB なしで動かす起動。データはメモリ上だけにあり、止めると消える(試用・画面の確認用)。
// 本来の起動は index.ts(PostgreSQL を使う)。
//   TRIAL_PASSWORD  設定すると、ユーザー名とパスワードを尋ねる(Basic 認証)。ユーザー名は TRIAL_USER(既定 trial)
//   PORT            待ち受けるポート(既定 3000)
//   WEB_DIST / PRO_CTCAE_MASTER_FILE  管理画面のビルド結果と、マスタのデータファイルの場所(1 つのファイルにまとめて配るとき)
import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { readDefaultProCtcae } from '../scripts/lib/pro-ctcae-source.ts';
import { createApp } from './app.ts';
import { createCatalogService } from './services/catalog.ts';
import { createSeedService } from './services/seed.ts';
import { createMemoryUnitOfWork } from './testing/memory-uow.ts';

const port = Number(process.env.PORT ?? 3000);
const webDist = process.env.WEB_DIST ?? new URL('../../web/dist', import.meta.url).pathname;
const uow = createMemoryUnitOfWork();
const { app } = createApp({ uow, webDist: existsSync(webDist) ? webDist : undefined });

// PRO-CTCAE マスタは、データファイル(なければ手元の PDF)から取り込む
const master = await readDefaultProCtcae();
if (master) {
  await createCatalogService(uow).replaceProCtcae({ requestId: 'dev-memory' }, master.symptoms);
  console.log(`PRO-CTCAE マスタ: ${master.symptoms.length} 症状を取り込んだ(${master.path})`);
  const created = await createSeedService(uow).seedSamples({ requestId: 'dev-memory' });
  console.log(`サンプル: ${created.join('、')}`);
} else {
  console.log('PRO-CTCAE マスタ: 空(データファイルも PDF もない)。質問票と治療計画の画面はサーバのエラーになる');
}

// 外部に公開するときは、合言葉を知っている人だけに絞る
const password = process.env.TRIAL_PASSWORD;
const server = password
  ? new Hono().use(basicAuth({ username: process.env.TRIAL_USER ?? 'trial', password, realm: 'trial' })).route('/', app)
  : app;

serve({ fetch: server.fetch, port }, () =>
  console.log(`起動した(メモリ上のデータ、合言葉${password ? 'あり' : 'なし'}): http://localhost:${port}`),
);
