import type { Prisma } from '../db/generated/client.ts';
import type { ProCtcaeRepository } from '../services/ports/index.ts';

export function createProCtcaeRepository(tx: Prisma.TransactionClient): ProCtcaeRepository {
  return {
    async list() {
      const rows = await tx.proCtcaeSymptom.findMany({
        orderBy: { no: 'asc' },
        include: { items: { orderBy: { position: 'asc' } } },
      });
      return rows.map((r) => ({
        code: r.code,
        no: r.no,
        term: r.term,
        label: r.label,
        note: r.note,
        category: r.category,
        items: r.items.map((i) => ({
          source: 'PRO_CTCAE' as const,
          proCtcaeCode: i.code,
          text: i.text,
          answerType: 'SINGLE_CHOICE' as const,
          options: Array.isArray(i.options) ? i.options.map(String) : [],
          required: true,
        })),
      }));
    },

    async replaceAll(symptoms) {
      // 症状と質問を、それぞれ 1 回のクエリで入れる(1 件ずつ入れると、トランザクションの時間切れになりうる)
      await tx.proCtcaeSymptom.deleteMany();
      await tx.proCtcaeSymptom.createMany({
        data: symptoms.map((s) => ({ code: s.code, no: s.no, term: s.term, label: s.label, note: s.note, category: s.category })),
      });
      await tx.proCtcaeItem.createMany({
        data: symptoms.flatMap((s) =>
          s.items.map((i, position) => ({ code: i.proCtcaeCode!, symptomCode: s.code, position, text: i.text, options: i.options })),
        ),
      });
    },
  };
}
