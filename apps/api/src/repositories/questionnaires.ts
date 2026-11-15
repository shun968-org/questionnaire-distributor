import type { Prisma } from '../db/generated/client.ts';
import type { Questionnaire, QuestionnaireInput } from '../schemas/domain/questionnaire.ts';
import type { QuestionnaireRepository } from '../services/ports/index.ts';

const include = {
  sections: { orderBy: { position: 'asc' }, include: { questions: { orderBy: { position: 'asc' } } } },
} satisfies Prisma.QuestionnaireInclude;

type Row = Prisma.QuestionnaireGetPayload<{ include: typeof include }>;

const toDomain = (row: Row): Questionnaire => ({
  id: row.id,
  name: row.name,
  description: row.description,
  templateKey: row.templateKey,
  updatedAt: row.updatedAt.toISOString(),
  sections: row.sections.map((s) => ({
    title: s.title,
    questions: s.questions.map((q) => ({
      source: q.source,
      proCtcaeCode: q.proCtcaeCode,
      text: q.text,
      answerType: q.answerType,
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      required: q.required,
    })),
  })),
});

const sectionsData = (input: QuestionnaireInput) =>
  input.sections.map((s, i) => ({
    position: i,
    title: s.title,
    questions: { create: s.questions.map((q, j) => ({ ...q, position: j })) },
  }));

const fields = (input: QuestionnaireInput) => ({
  name: input.name,
  description: input.description,
  templateKey: input.templateKey,
});

export function createQuestionnaireRepository(tx: Prisma.TransactionClient): QuestionnaireRepository {
  return {
    async list() {
      const rows = await tx.questionnaire.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          sections: { include: { _count: { select: { questions: true } } } },
          rules: { select: { plan: { select: { id: true, name: true } } } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        sectionCount: r.sections.length,
        questionCount: r.sections.reduce((sum, s) => sum + s._count.questions, 0),
        // 同じ計画に配信が複数あっても、計画は 1 回だけ出す
        usedByPlans: [...new Map(r.rules.map((rule) => [rule.plan.id, rule.plan])).values()].sort((a, b) => a.name.localeCompare(b.name)),
        updatedAt: r.updatedAt.toISOString(),
      }));
    },

    async find(id) {
      const row = await tx.questionnaire.findUnique({ where: { id }, include });
      return row && toDomain(row);
    },

    async findNames(ids) {
      const rows = await tx.questionnaire.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      return new Map(rows.map((r) => [r.id, r.name]));
    },

    async create(input) {
      const row = await tx.questionnaire.create({
        data: { ...fields(input), sections: { create: sectionsData(input) } },
        include,
      });
      return toDomain(row);
    },

    async update(id, input) {
      if (!(await tx.questionnaire.findUnique({ where: { id }, select: { id: true } }))) return null;
      // 章と質問は、いったん消して作り直す
      await tx.questionnaireSection.deleteMany({ where: { questionnaireId: id } });
      const row = await tx.questionnaire.update({
        where: { id },
        data: { ...fields(input), sections: { create: sectionsData(input) } },
        include,
      });
      return toDomain(row);
    },

    async delete(id) {
      const { count } = await tx.questionnaire.deleteMany({ where: { id } });
      return count > 0;
    },

    async isUsed(id) {
      return (await tx.deliveryRule.count({ where: { questionnaireId: id } })) > 0;
    },
  };
}
