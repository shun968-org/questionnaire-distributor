// PRO-CTCAE マスタの元になるデータを読む。
//   - マスタのデータファイル(JSON): PDF から取り込んだ結果を書き出したもの。git では管理しない。配布するイメージには、これを同梱する
//   - PRO-CTCAE 日本語版の PDF: 参考として手元に置いたもの。データファイルを書き出したら要らない(配布物には入れない)
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { type ProCtcaeSymptom, proCtcaeSymptomSchema } from '../../src/schemas/domain/catalog.ts';

// 1 つのファイルにまとめて配るときは、このファイルからの相対位置が変わるので、環境変数で場所を渡す
export const MASTER_FILE = process.env.PRO_CTCAE_MASTER_FILE ?? fileURLToPath(new URL('../../data/pro-ctcae-master.json', import.meta.url));
export const PDF_FILE = fileURLToPath(new URL('../../../../docs/pro-ctcae_japanese.pdf', import.meta.url));

export async function readProCtcaeFile(path: string): Promise<ProCtcaeSymptom[]> {
  if (path.endsWith('.json')) {
    return proCtcaeSymptomSchema.array().min(1).parse(JSON.parse(await readFile(path, 'utf8')));
  }
  // PDF の読み取りに使うライブラリは、PDF を読むときだけ読み込む
  const { parseProCtcae, readPdfLines } = await import('./parse-pro-ctcae.ts');
  return parseProCtcae(await readPdfLines(path));
}

/** 既定の置き場所から読む。データファイルがあればそれを、なければ PDF を使う。どちらもなければ null */
export async function readDefaultProCtcae(): Promise<{ symptoms: ProCtcaeSymptom[]; path: string } | null> {
  const path = [MASTER_FILE, PDF_FILE].find((p) => existsSync(p));
  return path ? { symptoms: await readProCtcaeFile(path), path } : null;
}
