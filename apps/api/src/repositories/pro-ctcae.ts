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
      await tx.proCtcaeSymptom.deleteMany();
      for (const s of symptoms) {
        await tx.proCtcaeSymptom.create({
          data: {
            code: s.code,
            no: s.no,
            term: s.term,
            label: s.label,
            note: s.note,
            category: s.category,
            items: { create: s.items.map((i, position) => ({ code: i.proCtcaeCode!, position, text: i.text, options: i.options })) },
          },
        });
      }
    },
  };
}
