import { z } from 'zod';

export const groupFormSchema = z.object({
  name: z.string().trim().min(1, '名前を入力する').max(100),
  /** 空文字は「未選択」 */
  planId: z.string(),
});

export const addPatientsFormSchema = z.object({
  count: z.number({ error: '人数を数字で入力する' }).int().min(1, '1 人以上にする').max(200, '一度に 200 人まで'),
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付を入力する');

export const startDateFormSchema = z.object({ startDate: date.or(z.literal('')) });

export const suspendFormSchema = z.object({
  suspendedOn: date,
  reason: z.string().trim().max(500),
});

export type GroupFormValues = z.infer<typeof groupFormSchema>;
export type AddPatientsFormValues = z.infer<typeof addPatientsFormSchema>;
export type StartDateFormValues = z.infer<typeof startDateFormSchema>;
export type SuspendFormValues = z.infer<typeof suspendFormSchema>;
