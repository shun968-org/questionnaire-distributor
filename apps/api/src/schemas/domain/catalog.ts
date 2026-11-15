import { z } from 'zod';
import { planInputSchema } from './plan.ts';
import { questionnaireInputSchema, questionSchema } from './questionnaire.ts';

/** PRO-CTCAE の症状(DB のマスタ)。items が、その症状について尋ねる質問(頻度・程度・支障など) */
export const proCtcaeSymptomSchema = z.object({
  code: z.string(),
  /** 資料の項目番号 */
  no: z.number().int(),
  /** 資料の Symptom Term(英語) */
  term: z.string(),
  label: z.string(),
  /** 項目に付いている、回答者への注意書き */
  note: z.string().nullable(),
  category: z.string(),
  items: z.array(questionSchema),
});

/** レジメンのテンプレート。質問票と治療計画の初期値を入れるためだけに使う */
export const regimenTemplateSchema = z.object({
  key: z.string(),
  name: z.string(),
  disease: z.string(),
  /** もとにした資料 */
  source: z.string(),
  questionnaire: questionnaireInputSchema,
  plan: planInputSchema,
});

export const catalogSchema = z.object({
  proCtcae: z.array(proCtcaeSymptomSchema),
  regimenTemplates: z.array(regimenTemplateSchema),
});

export type ProCtcaeSymptom = z.infer<typeof proCtcaeSymptomSchema>;
export type RegimenTemplate = z.infer<typeof regimenTemplateSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
