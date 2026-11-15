import { ConflictError, NotFoundError, ValidationError } from '../errors/index.ts';
import type { PlanInput } from '../schemas/domain/plan.ts';
import type { QuestionnaireRepository, Repositories, RequestContext, UnitOfWork } from './ports/index.ts';

async function assertQuestionnairesExist(questionnaires: QuestionnaireRepository, input: PlanInput) {
  const ids = [...new Set(input.rules.map((r) => r.questionnaireId))];
  const names = await questionnaires.findNames(ids);
  if (names.size !== ids.length) throw new ValidationError('質問票マスタにない質問票が、配信スケジュールに入っている');
}

export function createPlanService(uow: UnitOfWork<Pick<Repositories, 'plans' | 'questionnaires'>>) {
  return {
    list: (ctx: RequestContext) => uow.run(ctx, ({ plans }) => plans.list()),

    get: (ctx: RequestContext, id: string) =>
      uow.run(ctx, async ({ plans }) => {
        const found = await plans.find(id);
        if (!found) throw new NotFoundError('治療計画が見つからない');
        return found;
      }),

    create: (ctx: RequestContext, input: PlanInput) =>
      uow.run(ctx, async ({ plans, questionnaires }) => {
        await assertQuestionnairesExist(questionnaires, input);
        return plans.create(input);
      }),

    update: (ctx: RequestContext, id: string, input: PlanInput) =>
      uow.run(ctx, async ({ plans, questionnaires }) => {
        await assertQuestionnairesExist(questionnaires, input);
        const updated = await plans.update(id, input);
        if (!updated) throw new NotFoundError('治療計画が見つからない');
        return updated;
      }),

    delete: (ctx: RequestContext, id: string) =>
      uow.run(ctx, async ({ plans }) => {
        if (await plans.isUsed(id)) throw new ConflictError('患者グループに適用されている治療計画は削除できない');
        if (!(await plans.delete(id))) throw new NotFoundError('治療計画が見つからない');
      }),
  };
}
export type PlanService = ReturnType<typeof createPlanService>;
