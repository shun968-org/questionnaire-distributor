import type { ProCtcaeSymptom } from '../../schemas/domain/catalog.ts';
import type { Group, GroupInput, GroupSummary, Patient } from '../../schemas/domain/group.ts';
import type { Plan, PlanInput, PlanSummary } from '../../schemas/domain/plan.ts';
import type { Questionnaire, QuestionnaireInput, QuestionnaireSummary } from '../../schemas/domain/questionnaire.ts';

/** 処理の単位ごとの値。認証・RLS を入れるときに、ログインしたユーザーの値を足す */
export type RequestContext = { requestId: string };

export interface QuestionnaireRepository {
  list(): Promise<QuestionnaireSummary[]>;
  find(id: string): Promise<Questionnaire | null>;
  /** 存在する ID と名前だけを返す */
  findNames(ids: string[]): Promise<Map<string, string>>;
  create(input: QuestionnaireInput): Promise<Questionnaire>;
  update(id: string, input: QuestionnaireInput): Promise<Questionnaire | null>;
  delete(id: string): Promise<boolean>;
  /** 治療計画の配信ルールから使われているか */
  isUsed(id: string): Promise<boolean>;
}

export interface PlanRepository {
  list(): Promise<PlanSummary[]>;
  find(id: string): Promise<Plan | null>;
  create(input: PlanInput): Promise<Plan>;
  update(id: string, input: PlanInput): Promise<Plan | null>;
  delete(id: string): Promise<boolean>;
  /** 患者グループに適用されているか */
  isUsed(id: string): Promise<boolean>;
}

export type PatientPatch = Partial<Pick<Patient, 'startDate' | 'status' | 'suspendedOn' | 'suspendReason'>>;

export interface GroupRepository {
  list(): Promise<GroupSummary[]>;
  find(id: string): Promise<Group | null>;
  create(input: GroupInput): Promise<Group>;
  update(id: string, input: GroupInput): Promise<Group | null>;
  confirm(id: string, at: Date): Promise<void>;
  /** 渡した患者 ID のうち、すでに使われているもの */
  findExistingCodes(codes: string[]): Promise<Set<string>>;
  addPatients(groupId: string, codes: string[]): Promise<void>;
  findPatient(id: string): Promise<Patient | null>;
  updatePatient(id: string, patch: PatientPatch): Promise<void>;
  deletePatient(id: string): Promise<void>;
}

export interface ProCtcaeRepository {
  list(): Promise<ProCtcaeSymptom[]>;
  replaceAll(symptoms: ProCtcaeSymptom[]): Promise<void>;
}

export type Repositories = {
  proCtcae: ProCtcaeRepository;
  questionnaires: QuestionnaireRepository;
  plans: PlanRepository;
  groups: GroupRepository;
};

/** トランザクションの範囲。repository は run のコールバックでしか受け取れない */
export interface UnitOfWork<R = Repositories> {
  run<T>(ctx: RequestContext, fn: (repos: R) => Promise<T>): Promise<T>;
}
