import { ConflictError } from '../errors/index.ts';
import { createGroupRepository } from '../repositories/groups.ts';
import { createPlanRepository } from '../repositories/plans.ts';
import { createProCtcaeRepository } from '../repositories/pro-ctcae.ts';
import { createQuestionnaireRepository } from '../repositories/questionnaires.ts';
import type { UnitOfWork } from '../services/ports/index.ts';
import { Prisma, type PrismaClient } from './generated/client.ts';

export function createUnitOfWork(prisma: PrismaClient): UnitOfWork {
  return {
    async run(_ctx, fn) {
      try {
        return await prisma.$transaction((tx) =>
          fn({
            proCtcae: createProCtcaeRepository(tx),
            questionnaires: createQuestionnaireRepository(tx),
            plans: createPlanRepository(tx),
            groups: createGroupRepository(tx),
          }),
        );
      } catch (err) {
        // トランザクション自体のエラー(書き込みの競合・デッドロック)は、業務エラーに変換する
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
          throw new ConflictError('ほかの操作と重なった。もう一度やり直す');
        }
        throw err;
      }
    },
  };
}
