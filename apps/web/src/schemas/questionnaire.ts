import { z } from 'zod';

const questionSchema = z
  .object({
    source: z.enum(['PRO_CTCAE', 'CUSTOM']),
    proCtcaeCode: z.string().nullable(),
    text: z.string().trim().min(1, '質問文を入力する').max(500),
    answerType: z.enum(['SINGLE_CHOICE', 'MULTI_CHOICE', 'NUMBER', 'TEXT']),
    options: z.array(z.string().trim().min(1).max(100)).max(20, '選択肢は 20 個まで'),
    required: z.boolean(),
  })
  .superRefine((q, ctx) => {
    const isChoice = q.answerType === 'SINGLE_CHOICE' || q.answerType === 'MULTI_CHOICE';
    if (isChoice && q.options.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: '選択肢を 2 つ以上、1 行に 1 つ入力する' });
    }
  });

export const questionnaireFormSchema = z.object({
  name: z.string().trim().min(1, '名前を入力する').max(100),
  description: z.string().trim().max(1000),
  templateKey: z.string().nullable(),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1, '章のタイトルを入力する').max(100),
        questions: z.array(questionSchema).min(1, '章に質問を 1 つ以上入れる').max(50),
      }),
    )
    .min(1, '章を 1 つ以上作る')
    .max(20),
});

export type QuestionnaireFormValues = z.infer<typeof questionnaireFormSchema>;
