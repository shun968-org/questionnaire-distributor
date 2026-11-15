import { ConflictError, NotFoundError, ValidationError } from '../errors/index.ts';
import type { GroupDetail, GroupInput } from '../schemas/domain/group.ts';
import type { GroupRepository, PlanRepository, Repositories, RequestContext, UnitOfWork } from './ports/index.ts';
import { computeSchedule } from './schedule.ts';

// 患者 ID に使う文字。読み間違えやすい 0/O、1/I/L は除く
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `P-${Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')}`;
}

async function findGroup(groups: GroupRepository, id: string) {
  const group = await groups.find(id);
  if (!group) throw new NotFoundError('患者グループが見つからない');
  return group;
}

async function findPatient(groups: GroupRepository, id: string) {
  const patient = await groups.findPatient(id);
  if (!patient) throw new NotFoundError('患者が見つからない');
  return patient;
}

async function assertPlanExists(plans: PlanRepository, planId: string | null) {
  if (planId && !(await plans.find(planId))) throw new ValidationError('治療計画が見つからない');
}

type Deps = { uow: UnitOfWork<Repositories>; today: () => string; now: () => Date };

export function createGroupService({ uow, today, now }: Deps) {
  return {
    list: (ctx: RequestContext) => uow.run(ctx, ({ groups }) => groups.list()),

    /** グループと、患者ごとの配信の予定(開始日から計算する) */
    get: (ctx: RequestContext, id: string): Promise<GroupDetail> =>
      uow.run(ctx, async ({ groups, plans, questionnaires }) => {
        const group = await findGroup(groups, id);
        const plan = group.planId ? await plans.find(group.planId) : null;
        const names = plan
          ? await questionnaires.findNames([...new Set(plan.rules.map((r) => r.questionnaireId))])
          : new Map<string, string>();
        const date = today();
        return {
          group,
          plan,
          today: date,
          schedules: plan
            ? group.patients.map((p) =>
                computeSchedule({
                  plan,
                  questionnaireNames: names,
                  patientId: p.id,
                  startDate: p.startDate,
                  suspendedOn: p.suspendedOn,
                  today: date,
                }),
              )
            : [],
        };
      }),

    create: (ctx: RequestContext, input: GroupInput) =>
      uow.run(ctx, async ({ groups, plans }) => {
        await assertPlanExists(plans, input.planId);
        return groups.create(input);
      }),

    update: (ctx: RequestContext, id: string, input: GroupInput) =>
      uow.run(ctx, async ({ groups, plans }) => {
        const group = await findGroup(groups, id);
        if (group.confirmedAt && group.planId !== input.planId) {
          throw new ConflictError('患者を確定したグループの治療計画は変更できない');
        }
        await assertPlanExists(plans, input.planId);
        await groups.update(id, input);
      }),

    /** 患者 ID を発行して、グループに割り当てる。確定した後はできない */
    addPatients: (ctx: RequestContext, id: string, count: number) =>
      uow.run(ctx, async ({ groups }) => {
        const group = await findGroup(groups, id);
        if (group.confirmedAt) throw new ConflictError('患者を確定したグループには、患者を追加できない');
        const codes = new Set<string>();
        while (codes.size < count) {
          const code = randomCode();
          if (!(await groups.codeExists(code))) codes.add(code);
        }
        await groups.addPatients(id, [...codes]);
      }),

    removePatient: (ctx: RequestContext, patientId: string) =>
      uow.run(ctx, async ({ groups }) => {
        const patient = await findPatient(groups, patientId);
        const group = await findGroup(groups, patient.groupId);
        if (group.confirmedAt) throw new ConflictError('患者を確定したグループからは、患者を外せない');
        await groups.deletePatient(patientId);
      }),

    /** グループの患者を確定する。確定した後は患者を追加できない */
    confirm: (ctx: RequestContext, id: string) =>
      uow.run(ctx, async ({ groups }) => {
        const group = await findGroup(groups, id);
        if (group.confirmedAt) throw new ConflictError('すでに確定している');
        if (!group.planId) throw new ConflictError('治療計画を選んでから確定する');
        if (group.patients.length === 0) throw new ConflictError('患者を 1 人以上割り当ててから確定する');
        await groups.confirm(id, now());
      }),

    /** 治療開始日を設定する。患者ごとに違う日を設定できる */
    setStartDate: (ctx: RequestContext, patientId: string, startDate: string | null) =>
      uow.run(ctx, async ({ groups }) => {
        const patient = await findPatient(groups, patientId);
        if (patient.status === 'SUSPENDED') throw new ConflictError('中断した患者の治療開始日は変更できない');
        await groups.updatePatient(patientId, { startDate });
      }),

    /** 治療を中断する。中断した日より後に始まる配信を停止する(患者単位) */
    suspend: (ctx: RequestContext, patientId: string, suspendedOn: string, reason: string) =>
      uow.run(ctx, async ({ groups }) => {
        const patient = await findPatient(groups, patientId);
        if (patient.status === 'SUSPENDED') throw new ConflictError('すでに中断している');
        await groups.updatePatient(patientId, { status: 'SUSPENDED', suspendedOn, suspendReason: reason });
      }),

    /** 中断を取り消す(誤って中断した場合)。配信の予定は、もとの治療開始日からの日程に戻る */
    cancelSuspension: (ctx: RequestContext, patientId: string) =>
      uow.run(ctx, async ({ groups }) => {
        const patient = await findPatient(groups, patientId);
        if (patient.status !== 'SUSPENDED') throw new ConflictError('中断していない');
        await groups.updatePatient(patientId, { status: 'ACTIVE', suspendedOn: null, suspendReason: '' });
      }),
  };
}
export type GroupService = ReturnType<typeof createGroupService>;
