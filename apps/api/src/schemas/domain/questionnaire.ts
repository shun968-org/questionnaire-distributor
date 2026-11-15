import { z } from 'zod';

export const questionSourceSchema = z.enum(['PRO_CTCAE', 'CUSTOM']);
export const answerTypeSchema = z.enum(['SINGLE_CHOICE', 'MULTI_CHOICE', 'NUMBER', 'TEXT']);

export const questionSchema = z
  .object({
    source: questionSourceSchema,
    /** PRO-CTCAE の項目のコード(例 NAUSEA:FREQ)。任意の質問では null */
    proCtcaeCode: z.string().min(1).nullable(),
    text: z.string().trim().min(1).max(500),
    answerType: answerTypeSchema,
    options: z.array(z.string().trim().min(1).max(100)).max(20),
    required: z.boolean(),
  })
  .superRefine((q, ctx) => {
    const isChoice = q.answerType === 'SINGLE_CHOICE' || q.answerType === 'MULTI_CHOICE';
    if (isChoice && q.options.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: '選択肢は 2 つ以上にする' });
    }
    if (q.source === 'PRO_CTCAE' && !q.proCtcaeCode) {
      ctx.addIssue({ code: 'custom', path: ['proCtcaeCode'], message: 'PRO-CTCAE の項目のコードが要る' });
    }
  });

/** 章。1 章が回答画面の 1 ページになる */
export const sectionSchema = z.object({
  title: z.string().trim().min(1).max(100),
  questions: z.array(questionSchema).min(1).max(50),
});

export const questionnaireInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  templateKey: z.string().min(1).nullable(),
  sections: z.array(sectionSchema).min(1).max(20),
});

export const questionnaireSchema = questionnaireInputSchema.extend({
  id: z.uuid(),
  updatedAt: z.iso.datetime(),
});

export const questionnaireSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  sectionCount: z.number().int(),
  questionCount: z.number().int(),
  /** この質問票を配信スケジュールで使っている治療計画 */
  usedByPlans: z.array(z.object({ id: z.uuid(), name: z.string() })),
  updatedAt: z.iso.datetime(),
});

export type Question = z.infer<typeof questionSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type QuestionnaireInput = z.infer<typeof questionnaireInputSchema>;
export type Questionnaire = z.infer<typeof questionnaireSchema>;
export type QuestionnaireSummary = z.infer<typeof questionnaireSummarySchema>;
