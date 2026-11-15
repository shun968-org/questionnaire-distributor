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
        // トランザクション自体のエラー(書き込みの競合・デッドロック)と、同時の操作で起きる制約の違反は、業務エラーに変換する
        //   P2034: 書き込みの競合・デッドロック
        //   P2002: 一意制約(同時に同じ患者 ID を発行した、など)
        //   P2003: 外部キー制約(使われ始めた治療計画・質問票を、同時に削除した、など)
        if (err instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002', 'P2003'].includes(err.code)) {
          throw new ConflictError('ほかの操作と重なった。もう一度やり直す');
        }
        throw err;
      }
    },
  };
}
