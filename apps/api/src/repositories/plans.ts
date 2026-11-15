import type { Prisma } from '../db/generated/client.ts';
import { drugSchema, type Plan, type PlanInput } from '../schemas/domain/plan.ts';
import type { PlanRepository } from '../services/ports/index.ts';

const include = {
  rules: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.TreatmentPlanInclude;

type Row = Prisma.TreatmentPlanGetPayload<{ include: typeof include }>;

const toDomain = (row: Row): Plan => ({
  id: row.id,
  name: row.name,
  disease: row.disease,
  regimenName: row.regimenName,
  templateKey: row.templateKey,
  cycleLengthDays: row.cycleLengthDays,
  cycleCount: row.cycleCount,
  baselineDays: row.baselineDays,
  drugs: drugSchema.array().parse(row.drugs),
  updatedAt: row.updatedAt.toISOString(),
  rules: row.rules.map((r) => ({
    questionnaireId: r.questionnaireId,
    dayOffset: r.dayOffset,
    windowDays: r.windowDays,
    cycleFrom: r.cycleFrom,
    cycleTo: r.cycleTo,
  })),
});

// 配信ルールは、受け取った並び順のまま保存する
const data = ({ rules, ...rest }: PlanInput) => ({
  ...rest,
  rules: { create: rules.map((rule, position) => ({ ...rule, position })) },
});

export function createPlanRepository(tx: Prisma.TransactionClient): PlanRepository {
  return {
    async list() {
      const rows = await tx.treatmentPlan.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { rules: true, groups: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        disease: r.disease,
        regimenName: r.regimenName,
        cycleLengthDays: r.cycleLengthDays,
        cycleCount: r.cycleCount,
        ruleCount: r._count.rules,
        groupCount: r._count.groups,
        updatedAt: r.updatedAt.toISOString(),
      }));
    },

    async find(id) {
      const row = await tx.treatmentPlan.findUnique({ where: { id }, include });
      return row && toDomain(row);
    },

    async create(input) {
      return toDomain(await tx.treatmentPlan.create({ data: data(input), include }));
    },

    async update(id, input) {
      if (!(await tx.treatmentPlan.findUnique({ where: { id }, select: { id: true } }))) return null;
      // 配信ルールは、いったん消して作り直す
      await tx.deliveryRule.deleteMany({ where: { planId: id } });
      return toDomain(await tx.treatmentPlan.update({ where: { id }, data: data(input), include }));
    },

    async delete(id) {
      const { count } = await tx.treatmentPlan.deleteMany({ where: { id } });
      return count > 0;
    },

    async isUsed(id) {
      return (await tx.patientGroup.count({ where: { planId: id } })) > 0;
    },
  };
}
