import { z } from 'zod';

export const drugSchema = z.object({
  name: z.string().trim().min(1).max(100),
  route: z.enum(['IV', 'ORAL']),
  /** 投与日(コースの何日目か。1 始まり) */
  days: z.array(z.number().int().min(1)).max(366),
});

export const deliveryRuleSchema = z.object({
  questionnaireId: z.uuid(),
  /** コースの 1 日目を 0 とした日数。負の値はベースライン(治療開始前)で、1 回だけ配信する */
  dayOffset: z.number().int(),
  /** 回答可能期間の日数(配信日を含む) */
  windowDays: z.number().int().min(1),
  cycleFrom: z.number().int().min(1),
  /** null は最後のコースまで */
  cycleTo: z.number().int().min(1).nullable(),
});

export const planInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    disease: z.string().trim().max(100),
    regimenName: z.string().trim().max(200),
    templateKey: z.string().min(1).nullable(),
    cycleLengthDays: z.number().int().min(1).max(366),
    cycleCount: z.number().int().min(1).max(100),
    baselineDays: z.number().int().min(0).max(60),
    drugs: z.array(drugSchema).max(30),
    rules: z.array(deliveryRuleSchema).max(200),
  })
  .superRefine((plan, ctx) => {
    plan.drugs.forEach((drug, i) => {
      if (drug.days.some((d) => d > plan.cycleLengthDays)) {
        ctx.addIssue({ code: 'custom', path: ['drugs', i, 'days'], message: '投与日が 1 コースの日数を超えている' });
      }
    });
    plan.rules.forEach((rule, i) => {
      const end = rule.dayOffset + rule.windowDays;
      if (rule.dayOffset < 0) {
        if (rule.dayOffset < -plan.baselineDays || end > 0) {
          ctx.addIssue({ code: 'custom', path: ['rules', i], message: 'ベースラインの配信は、ベースライン期間に収める' });
        }
        return;
      }
      if (end > plan.cycleLengthDays) {
        ctx.addIssue({ code: 'custom', path: ['rules', i], message: '回答可能期間は、1 コースの中に収める' });
      }
      const to = rule.cycleTo ?? plan.cycleCount;
      if (rule.cycleFrom > to || to > plan.cycleCount) {
        ctx.addIssue({ code: 'custom', path: ['rules', i], message: '対象のコースの範囲が正しくない' });
      }
    });
  });

export const planSchema = planInputSchema.extend({
  id: z.uuid(),
  updatedAt: z.iso.datetime(),
});

export const planSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  disease: z.string(),
  regimenName: z.string(),
  cycleLengthDays: z.number().int(),
  cycleCount: z.number().int(),
  ruleCount: z.number().int(),
  groupCount: z.number().int(),
  updatedAt: z.iso.datetime(),
});

export type Drug = z.infer<typeof drugSchema>;
export type DeliveryRule = z.infer<typeof deliveryRuleSchema>;
export type PlanInput = z.infer<typeof planInputSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanSummary = z.infer<typeof planSummarySchema>;
