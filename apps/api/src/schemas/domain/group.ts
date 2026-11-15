import { z } from 'zod';
import { planSchema } from './plan.ts';

export const patientSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  /** 発行した患者 ID */
  code: z.string(),
  /** 治療開始日(1 コース目の 1 日目) */
  startDate: z.iso.date().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  /** 治療を中断した日。この日より後に始まる配信を停止する */
  suspendedOn: z.iso.date().nullable(),
  suspendReason: z.string(),
});

export const groupInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  planId: z.uuid().nullable(),
});

export const groupSchema = groupInputSchema.extend({
  id: z.uuid(),
  /** 患者を確定した日時。確定した後は患者を追加できない */
  confirmedAt: z.iso.datetime().nullable(),
  patients: z.array(patientSchema),
});

export const groupSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  planId: z.uuid().nullable(),
  planName: z.string().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
  patientCount: z.number().int(),
  suspendedCount: z.number().int(),
});

/** 患者の開始日から計算した、1 回の配信 */
export const deliverySchema = z.object({
  questionnaireId: z.uuid(),
  questionnaireName: z.string(),
  /** 分類。BASELINE: 治療開始前に、治療による変化を見るもとにする質問。TREATMENT: 治療中のコースごとの質問 */
  phase: z.enum(['BASELINE', 'TREATMENT']),
  /** コースの番号。0 はベースライン */
  cycle: z.number().int(),
  opensOn: z.iso.date(),
  /** 回答可能期間の最後の日 */
  closesOn: z.iso.date(),
  /** SCHEDULED: 配信前、OPEN: 回答可能期間の中、CLOSED: 期間が終わった、STOPPED: 中断で停止した */
  status: z.enum(['SCHEDULED', 'OPEN', 'CLOSED', 'STOPPED']),
});

export const patientScheduleSchema = z.object({
  patientId: z.uuid(),
  /** 今日が何コース目の何日目か。開始前・終了後は null */
  currentCycle: z.number().int().nullable(),
  currentDay: z.number().int().nullable(),
  deliveries: z.array(deliverySchema),
});

export const groupDetailSchema = z.object({
  group: groupSchema,
  plan: planSchema.nullable(),
  today: z.iso.date(),
  schedules: z.array(patientScheduleSchema),
});

export type Patient = z.infer<typeof patientSchema>;
export type GroupInput = z.infer<typeof groupInputSchema>;
export type Group = z.infer<typeof groupSchema>;
export type GroupSummary = z.infer<typeof groupSummarySchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type PatientSchedule = z.infer<typeof patientScheduleSchema>;
export type GroupDetail = z.infer<typeof groupDetailSchema>;
