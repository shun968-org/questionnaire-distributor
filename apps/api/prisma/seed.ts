// DB に初期データを入れる: PRO-CTCAE マスタ(空のとき。データファイル、なければ PDF から)と、サンプル。
// 使い方: pnpm --filter api db:seed(何度実行してもよい)
import { MASTER_FILE, readDefaultProCtcae } from '../scripts/lib/pro-ctcae-source.ts';
import { createPrismaClient } from '../src/db/client.ts';
import { createUnitOfWork } from '../src/db/unit-of-work.ts';
import { createCatalogService } from '../src/services/catalog.ts';
import { createSeedService } from '../src/services/seed.ts';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54329/questionnaire';
const ctx = { requestId: 'seed' };

const prisma = createPrismaClient(databaseUrl);
try {
  const uow = createUnitOfWork(prisma);
  const masterIsEmpty = (await uow.run(ctx, ({ proCtcae }) => proCtcae.list())).length === 0;
  if (masterIsEmpty) {
    const source = await readDefaultProCtcae();
    if (!source) throw new Error(`PRO-CTCAE マスタが空で、取り込む元もない。${MASTER_FILE}(データファイル)を置く`);
    await createCatalogService(uow).replaceProCtcae(ctx, source.symptoms);
    console.log(`PRO-CTCAE マスタを取り込んだ: ${source.symptoms.length} 症状(${source.path})`);
  }
  const created = await createSeedService(uow).seedSamples(ctx);
  console.log(created.length > 0 ? `サンプルを登録した: ${created.join('、')}` : 'サンプルは登録済み');
} finally {
  await prisma.$disconnect();
}
