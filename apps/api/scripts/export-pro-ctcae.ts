// PRO-CTCAE 日本語版の PDF から読み取った内容を、マスタのデータファイル(JSON)に書き出す。DB は使わない。
// 書き出した後は、PDF がなくても、データファイルからマスタを作れる。
// 使い方: pnpm --filter api pro-ctcae:export [PDF のパス](既定は docs/pro-ctcae_japanese.pdf)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MASTER_FILE, PDF_FILE, readProCtcaeFile } from './lib/pro-ctcae-source.ts';

const pdf = process.argv[2] ? resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2]) : PDF_FILE;
const symptoms = await readProCtcaeFile(pdf);
await mkdir(dirname(MASTER_FILE), { recursive: true });
await writeFile(MASTER_FILE, `${JSON.stringify(symptoms, null, 2)}\n`);
console.log(`書き出した: ${symptoms.length} 症状、${symptoms.flatMap((s) => s.items).length} 問 → ${MASTER_FILE}`);
