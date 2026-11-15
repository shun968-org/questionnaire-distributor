// PRO-CTCAE 日本語版の PDF(NCI PRO-CTCAE® ITEMS-JAPANESE)から、症状と質問を読み取る。
// 質問文と選択肢は、PDF の文言をそのまま取り出す(行の折り返しをつなぐだけで、書き換えない)。
import { readFile } from 'node:fs/promises';
import type { ProCtcaeSymptom } from '../../src/schemas/domain/catalog.ts';

const PAGE_HEADERS = ['NCI- PRO-CTCAE', 'Item Library Version', 'The PRO-CTCAE® items', 'Sciences in the NATIONAL', 'U.S.A. Use of the', 'Version date:'];

// 症状選択の画面でまとめるための分類(項目番号の範囲)。資料にはなく、このシステムが付ける
const CATEGORIES: [lastNo: number, name: string][] = [
  [7, '口腔'], [18, '消化器'], [21, '呼吸器'], [23, '心臓・循環'], [38, '皮膚'], [40, '神経'], [45, '視覚・知覚'],
  [47, '注意・記憶'], [51, '痛み'], [53, '睡眠・覚醒'], [56, '気分'], [65, '婦人科・泌尿器'], [71, '性機能'], [Infinity, 'その他'],
];

const hasJapanese = (s: string) => /[぀-ヿ一-鿿]/.test(s);

/** PDF のテキストを、行の並びにする(同じ高さの文字を 1 行にまとめる) */
export async function readPdfLines(path: string): Promise<string[]> {
  // PDF を読むライブラリは、ここでだけ読み込む(PDF を使わない配布物では、読み込まれない)
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: true, verbosity: 0 }).promise;
  const lines: string[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    let y: number | null = null;
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const itemY = item.transform[5] as number;
      if (y !== null && Math.abs(itemY - y) > 2) {
        lines.push(line);
        line = '';
      }
      line += item.str;
      y = itemY;
    }
    lines.push(line);
  }
  return lines;
}

function attributeOf(options: string[]): string {
  if (options.includes('軽度')) return 'SEVERITY';
  if (options[0] === '全然ならなかった') return 'INTERFERENCE';
  if (options[1]?.startsWith('ほとんど')) return 'FREQUENCY';
  if (options[1] === '少し') return 'AMOUNT';
  return 'PRESENCE';
}

export function parseProCtcae(rawLines: string[]): ProCtcaeSymptom[] {
  let lines = rawLines.map((l) => l.trim()).filter((l) => l !== '' && !PAGE_HEADERS.some((h) => l.startsWith(h)));
  // 最後の「その他の症状」(自由記述)は取り込まない
  const other = lines.findIndex((l) => l.startsWith('OTHER SYMPTOMS'));
  if (other >= 0) lines = lines.slice(0, other);

  const starts = lines.flatMap((l, i) => (/^\d+\. PRO-CTCAE$/.test(l) ? [i] : []));
  return starts.map((start, k) => {
    const no = Number(lines[start]!.split('.')[0]);
    const block = lines.slice(start + 1, starts[k + 1] ?? lines.length).filter((l) => l !== '®');
    const questionStarts = block.flatMap((l, i) => (/^[a-e]\. /.test(l) ? [i] : []));
    const head = block.slice(0, questionStarts[0]);
    const term = head.filter((l) => !hasJapanese(l)).join(' ').replace('Symptom Term:', '').trim();
    let label = head.filter(hasJapanese).join('');
    // 症状名に、回答者への注意書きが続く項目がある(放射線治療の項目)
    let note: string | null = null;
    const withNote = /^(.*症状)は-(.+)$/.exec(label);
    if (withNote) [label, note] = [withNote[1]!, withNote[2]!];
    const code = term.toUpperCase().replace('W/', 'WITH ').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!term || !label || !code || questionStarts.length === 0) throw new Error(`項目 ${no} を読み取れない`);

    const items = questionStarts.map((qs, j) => {
      const q = block.slice(qs, questionStarts[j + 1] ?? block.length);
      // 選択肢は、行頭の「Ο」(ギリシャ文字)で始まる。「はい / いいえ」は、質問文と同じ行に「O」で並ぶ項目がある
      const optionStart = q.findIndex((l) => l.startsWith('Ο'));
      let text = q.slice(0, optionStart < 0 ? q.length : optionStart).join('').slice(3).trim();
      let options = optionStart < 0 ? [] : q.slice(optionStart).join('\n').split('Ο').map((o) => o.replace(/\s+/g, '')).filter(Boolean);
      const inline = /^(.*？)O (.+)$/.exec(text);
      if (options.length === 0 && inline) {
        text = inline[1]!;
        options = inline[2]!.split(' O ').map((o) => o.trim());
      }
      if (!text.endsWith('？') || options.length < 2) throw new Error(`項目 ${no} の質問を読み取れない: ${text}`);
      return {
        source: 'PRO_CTCAE' as const,
        proCtcaeCode: `${code}:${attributeOf(options)}`,
        text,
        answerType: 'SINGLE_CHOICE' as const,
        options,
        required: true,
      };
    });
    if (new Set(items.map((i) => i.proCtcaeCode)).size !== items.length) throw new Error(`項目 ${no} の質問の種類が重なっている`);
    return { code, no, term, label, note, category: CATEGORIES.find(([last]) => no <= last)![1], items };
  });
}
