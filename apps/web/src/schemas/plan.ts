import { z } from 'zod';

const int = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label}を数字で入力する` })
    .int(`${label}は整数にする`)
    .min(min, `${label}は ${min} 以上にする`)
    .max(max, `${label}は ${max} 以下にする`);

export const planFormSchema = z
  .object({
    name: z.string().trim().min(1, '名前を入力する').max(100),
    disease: z.string().trim().max(100),
    regimenName: z.string().trim().max(200),
    templateKey: z.string().nullable(),
    cycleLengthDays: int('1 コースの日数', 1, 366),
    cycleCount: int('コース数', 1, 100),
    baselineDays: int('ベースラインの日数', 0, 60),
    drugs: z
      .array(
        z.object({
          name: z.string().trim().min(1, '薬剤の名前を入力する').max(100),
          route: z.enum(['IV', 'ORAL']),
          days: z.array(z.number().int().min(1)),
        }),
      )
      .max(30, '薬剤の行は 30 までにする'),
    rules: z
      .array(
        z.object({
          questionnaireId: z.string(),
          dayOffset: z.number().int(),
          windowDays: z.number().int().min(1),
          cycleFrom: z.number().int().min(1),
          cycleTo: z.number().int().min(1).nullable(),
        }),
      )
      .max(200, '配信は 200 件までにする'),
  })
  .superRefine((plan, ctx) => {
    plan.drugs.forEach((drug, i) => {
      if (drug.days.some((d) => d > plan.cycleLengthDays)) {
        ctx.addIssue({ code: 'custom', path: ['drugs', i, 'days'], message: `${drug.name}: 投与日が 1 コースの日数を超えている` });
      }
    });
    const problems = new Set<string>();
    for (const rule of plan.rules) {
      const end = rule.dayOffset + rule.windowDays;
      if (rule.dayOffset < 0) {
        if (rule.dayOffset < -plan.baselineDays || end > 0) problems.add('ベースラインの配信が、ベースライン期間からはみ出している');
        continue;
      }
      if (end > plan.cycleLengthDays) problems.add('回答可能期間が、1 コースの日数からはみ出している配信がある');
      const to = rule.cycleTo ?? plan.cycleCount;
      if (rule.cycleFrom > to || to > plan.cycleCount) problems.add('対象のコースが、コース数の範囲に入っていない配信がある');
    }
    for (const message of problems) ctx.addIssue({ code: 'custom', path: ['rules'], message });
  });

export type PlanFormValues = z.infer<typeof planFormSchema>;
