import { existsSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseProCtcae, readPdfLines } from './parse-pro-ctcae.ts';

// 文言はリポジトリに持たないので、書式の読み取りは、作った文で確かめる
const lines = [
  'NCI- PRO-CTCAE® ITEMS-JAPANESE',
  '1. PRO-CTCAE',
  '® ',
  'Symptom Term: Sample pain',
  'サンプルの痛み',
  'a. サンプルの痛みは',
  'ありましたか？',
  'Ο なかった Ο ほとんどなかっ',
  'た',
  'Ο ときどき Ο 頻繁に Ο ほとんどいつも',
  'b. サンプルの痛みはどの程度でしたか？',
  'Ο そういうことは',
  'なかった',
  'Ο 軽度 Ο 中等度 Ο 高度 Ο 極めて高度',
  'Version date: 1/28/2022',
  '2. PRO-CTCAE',
  '®',
  'Symptom Term: Sample w/note (x/y)',
  'サンプルの症状は-この質問は該当する方への質問で',
  'す。',
  'a. サンプルの症状はありましたか？O はい O いいえ',
  'OTHER SYMPTOMS',
  'その他の症状',
  'Ο 無視される',
];

test('PDF の行から、症状・質問文・選択肢を読み取る(折り返しをつなぎ、その他の症状は取り込まない)', () => {
  expect(parseProCtcae(lines)).toEqual([
    {
      code: 'SAMPLE_PAIN',
      no: 1,
      term: 'Sample pain',
      label: 'サンプルの痛み',
      note: null,
      category: '口腔',
      items: [
        {
          source: 'PRO_CTCAE',
          proCtcaeCode: 'SAMPLE_PAIN:FREQUENCY',
          text: 'サンプルの痛みはありましたか？',
          answerType: 'SINGLE_CHOICE',
          options: ['なかった', 'ほとんどなかった', 'ときどき', '頻繁に', 'ほとんどいつも'],
          required: true,
        },
        {
          source: 'PRO_CTCAE',
          proCtcaeCode: 'SAMPLE_PAIN:SEVERITY',
          text: 'サンプルの痛みはどの程度でしたか？',
          answerType: 'SINGLE_CHOICE',
          options: ['そういうことはなかった', '軽度', '中等度', '高度', '極めて高度'],
          required: true,
        },
      ],
    },
    {
      code: 'SAMPLE_WITH_NOTE_X_Y',
      no: 2,
      term: 'Sample w/note (x/y)',
      label: 'サンプルの症状',
      note: 'この質問は該当する方への質問です。',
      category: '口腔',
      items: [
        {
          source: 'PRO_CTCAE',
          proCtcaeCode: 'SAMPLE_WITH_NOTE_X_Y:PRESENCE',
          text: 'サンプルの症状はありましたか？',
          answerType: 'SINGLE_CHOICE',
          options: ['はい', 'いいえ'],
          required: true,
        },
      ],
    },
  ]);
});

// PDF は git で管理しないので、手元にあるときだけ確かめる
const pdf = new URL('../../../../docs/pro-ctcae_japanese.pdf', import.meta.url).pathname;
test.skipIf(!existsSync(pdf))('PRO-CTCAE 日本語版の PDF から、80 症状・124 問を読み取る', async () => {
  const symptoms = parseProCtcae(await readPdfLines(pdf));
  expect(symptoms.map((s) => s.no)).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
  expect(symptoms.flatMap((s) => s.items)).toHaveLength(124);
  expect(new Set(symptoms.flatMap((s) => s.items.map((i) => i.proCtcaeCode))).size).toBe(124);
  // テンプレートが使う症状が、すべてある
  const { regimenTemplates } = await import('../../src/services/catalog/regimen-templates.ts');
  const codes = new Set(symptoms.map((s) => s.code));
  const used = regimenTemplates.flatMap((t) => t.questionnaire.sections.flatMap((s) => s.proCtcaeSymptoms));
  expect(used.filter((c) => !codes.has(c))).toEqual([]);
});
