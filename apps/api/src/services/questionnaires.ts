import { ConflictError, NotFoundError, ValidationError } from '../errors/index.ts';
import type { QuestionnaireInput } from '../schemas/domain/questionnaire.ts';
import { loadProCtcaeMaster } from './catalog.ts';
import type { ProCtcaeRepository, Repositories, RequestContext, UnitOfWork } from './ports/index.ts';

/** PRO-CTCAE の質問は、マスタの文言のまま使う。変えたいときは、任意の質問として作る */
async function assertProCtcaeWording(proCtcae: ProCtcaeRepository, input: QuestionnaireInput) {
  const questions = input.sections.flatMap((s) => s.questions).filter((q) => q.source === 'PRO_CTCAE');
  if (questions.length === 0) return;
  const master = new Map((await loadProCtcaeMaster(proCtcae)).flatMap((s) => s.items).map((i) => [i.proCtcaeCode, i]));
  for (const q of questions) {
    const official = master.get(q.proCtcaeCode);
    const same =
      official !== undefined &&
      q.text === official.text &&
      q.answerType === official.answerType &&
      q.options.length === official.options.length &&
      q.options.every((o, i) => o === official.options[i]);
    if (!same) throw new ValidationError(`PRO-CTCAE の質問は、マスタの文言と選択肢のまま使う: ${q.text}`);
  }
}

export function createQuestionnaireService(uow: UnitOfWork<Pick<Repositories, 'questionnaires' | 'proCtcae'>>) {
  return {
    list: (ctx: RequestContext) => uow.run(ctx, ({ questionnaires }) => questionnaires.list()),

    get: (ctx: RequestContext, id: string) =>
      uow.run(ctx, async ({ questionnaires }) => {
        const found = await questionnaires.find(id);
        if (!found) throw new NotFoundError('質問票が見つからない');
        return found;
      }),

    create: (ctx: RequestContext, input: QuestionnaireInput) =>
      uow.run(ctx, async ({ questionnaires, proCtcae }) => {
        await assertProCtcaeWording(proCtcae, input);
        return questionnaires.create(input);
      }),

    update: (ctx: RequestContext, id: string, input: QuestionnaireInput) =>
      uow.run(ctx, async ({ questionnaires, proCtcae }) => {
        await assertProCtcaeWording(proCtcae, input);
        const updated = await questionnaires.update(id, input);
        if (!updated) throw new NotFoundError('質問票が見つからない');
        return updated;
      }),

    delete: (ctx: RequestContext, id: string) =>
      uow.run(ctx, async ({ questionnaires }) => {
        if (await questionnaires.isUsed(id)) {
          throw new ConflictError('治療計画の配信スケジュールで使われている質問票は削除できない');
        }
        if (!(await questionnaires.delete(id))) throw new NotFoundError('質問票が見つからない');
      }),
  };
}
export type QuestionnaireService = ReturnType<typeof createQuestionnaireService>;
