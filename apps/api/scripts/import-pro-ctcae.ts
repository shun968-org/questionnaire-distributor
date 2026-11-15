// PRO-CTCAE マスタを、データファイル(JSON)または PRO-CTCAE 日本語版の PDF の内容で置き換える。
// 使い方: pnpm --filter api db:import-pro-ctcae [.json か .pdf のパス]
//   パスを省くと、データファイル(apps/api/data/pro-ctcae-master.json)を、なければ docs/pro-ctcae_japanese.pdf を使う
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/db/client.ts';
import { createUnitOfWork } from '../src/db/unit-of-work.ts';
import { createCatalogService } from '../src/services/catalog.ts';
import { readDefaultProCtcae, readProCtcaeFile } from './lib/pro-ctcae-source.ts';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54329/questionnaire';
// pnpm はスクリプトを apps/api で実行するので、相対パスは呼び出し元のディレクトリから解決する
const given = process.argv[2] ? resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2]) : null;
const source = given ? { symptoms: await readProCtcaeFile(given), path: given } : await readDefaultProCtcae();
if (!source) throw new Error('取り込む元がない。データファイルか PDF のパスを指定する');
const { symptoms, path } = source;

const prisma = createPrismaClient(databaseUrl);
try {
  await createCatalogService(createUnitOfWork(prisma)).replaceProCtcae({ requestId: 'import-pro-ctcae' }, symptoms);
  console.log(`PRO-CTCAE マスタを置き換えた: ${symptoms.length} 症状、${symptoms.flatMap((s) => s.items).length} 問(${path})`);
} finally {
  await prisma.$disconnect();
}
