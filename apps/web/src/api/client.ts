// API クライアント。API の呼び出しは、すべてここを通す(ADR-0003)。型は API が公開する型から作る(ADR-0001)。
import { hc, type InferRequestType } from 'hono/client';
import type { AppType } from '../../../api/src/app.ts';

const rpc = hc<AppType>('/api');

export type QuestionnaireInput = InferRequestType<typeof rpc.questionnaires.$post>['json'];
export type PlanInput = InferRequestType<typeof rpc.plans.$post>['json'];
export type GroupInput = InferRequestType<typeof rpc.groups.$post>['json'];

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type JsonResponse = { ok: boolean; status: number; json(): Promise<unknown> };

/** 成功した応答(2xx)の本文の型 */
type Body<R> = Exclude<R, { ok: false }> extends { json(): Promise<infer T> } ? T : never;

async function call<R extends JsonResponse>(request: Promise<R>): Promise<Body<R>> {
  const res = await request;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `入力した内容を API が受け付けなかった(${res.status})`, res.status);
  }
  return (await res.json()) as Body<R>;
}

export const api = {
  catalog: () => call(rpc.catalog.$get()),

  questionnaires: {
    list: () => call(rpc.questionnaires.$get()),
    get: (id: string) => call(rpc.questionnaires[':id'].$get({ param: { id } })),
    create: (json: QuestionnaireInput) => call(rpc.questionnaires.$post({ json })),
    update: (id: string, json: QuestionnaireInput) => call(rpc.questionnaires[':id'].$put({ param: { id }, json })),
    delete: (id: string) => call(rpc.questionnaires[':id'].$delete({ param: { id } })),
  },

  plans: {
    list: () => call(rpc.plans.$get()),
    get: (id: string) => call(rpc.plans[':id'].$get({ param: { id } })),
    create: (json: PlanInput) => call(rpc.plans.$post({ json })),
    update: (id: string, json: PlanInput) => call(rpc.plans[':id'].$put({ param: { id }, json })),
    delete: (id: string) => call(rpc.plans[':id'].$delete({ param: { id } })),
  },

  groups: {
    list: () => call(rpc.groups.$get()),
    get: (id: string) => call(rpc.groups[':id'].$get({ param: { id } })),
    create: (json: GroupInput) => call(rpc.groups.$post({ json })),
    update: (id: string, json: GroupInput) => call(rpc.groups[':id'].$put({ param: { id }, json })),
    addPatients: (id: string, count: number) => call(rpc.groups[':id'].patients.$post({ param: { id }, json: { count } })),
    confirm: (id: string) => call(rpc.groups[':id'].confirm.$post({ param: { id } })),
  },

  patients: {
    remove: (patientId: string) => call(rpc.patients[':patientId'].$delete({ param: { patientId } })),
    setStartDate: (patientId: string, startDate: string | null) =>
      call(rpc.patients[':patientId']['start-date'].$put({ param: { patientId }, json: { startDate } })),
    suspend: (patientId: string, json: { suspendedOn: string; reason: string }) =>
      call(rpc.patients[':patientId'].suspension.$post({ param: { patientId }, json })),
    cancelSuspension: (patientId: string) => call(rpc.patients[':patientId'].suspension.$delete({ param: { patientId } })),
  },
};

type Api = typeof api;
type Result<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;

export type Catalog = Result<Api['catalog']>;
export type ProCtcaeSymptom = Catalog['proCtcae'][number];
export type RegimenTemplate = Catalog['regimenTemplates'][number];

export type Questionnaire = Result<Api['questionnaires']['get']>;
export type QuestionnaireSummary = Result<Api['questionnaires']['list']>[number];
export type Question = Questionnaire['sections'][number]['questions'][number];

export type Plan = Result<Api['plans']['get']>;
export type PlanSummary = Result<Api['plans']['list']>[number];
export type DeliveryRule = Plan['rules'][number];
export type Drug = Plan['drugs'][number];

export type GroupDetail = Result<Api['groups']['get']>;
export type GroupSummary = Result<Api['groups']['list']>[number];
export type Patient = GroupDetail['group']['patients'][number];
export type PatientSchedule = GroupDetail['schedules'][number];
export type Delivery = PatientSchedule['deliveries'][number];
