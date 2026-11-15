import { z } from 'zod';
import { groupInputSchema } from '../domain/group.ts';
import { planInputSchema } from '../domain/plan.ts';
import { questionnaireInputSchema } from '../domain/questionnaire.ts';

export const idParamSchema = z.object({ id: z.uuid() });
export const patientParamSchema = z.object({ patientId: z.uuid() });

export const questionnaireBodySchema = questionnaireInputSchema;
export const planBodySchema = planInputSchema;
export const groupBodySchema = groupInputSchema;

export const addPatientsBodySchema = z.object({ count: z.number().int().min(1).max(200) });
export const startDateBodySchema = z.object({ startDate: z.iso.date().nullable() });
export const suspendBodySchema = z.object({
  suspendedOn: z.iso.date(),
  reason: z.string().trim().max(500),
});
