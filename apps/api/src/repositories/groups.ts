import type { Patient as PatientRow, Prisma } from '../db/generated/client.ts';
import type { Group, Patient } from '../schemas/domain/group.ts';
import type { GroupRepository } from '../services/ports/index.ts';

const include = { patients: { orderBy: [{ createdAt: 'asc' }, { code: 'asc' }] } } satisfies Prisma.PatientGroupInclude;

type Row = Prisma.PatientGroupGetPayload<{ include: typeof include }>;

// DB の DATE 型は UTC の 0 時の Date で受け渡す
const toDateString = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

const toPatient = (row: PatientRow): Patient => ({
  id: row.id,
  groupId: row.groupId,
  code: row.code,
  startDate: toDateString(row.startDate),
  status: row.status,
  suspendedOn: toDateString(row.suspendedOn),
  suspendReason: row.suspendReason,
});

const toDomain = (row: Row): Group => ({
  id: row.id,
  name: row.name,
  planId: row.planId,
  confirmedAt: row.confirmedAt?.toISOString() ?? null,
  patients: row.patients.map(toPatient),
});

export function createGroupRepository(tx: Prisma.TransactionClient): GroupRepository {
  return {
    async list() {
      // 患者の数は、行を読まずに DB で数える
      const rows = await tx.patientGroup.findMany({
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { name: true } }, _count: { select: { patients: true } } },
      });
      const suspended = await tx.patient.groupBy({
        by: ['groupId'],
        where: { status: 'SUSPENDED' },
        _count: { _all: true },
      });
      const suspendedCounts = new Map(suspended.map((s) => [s.groupId, s._count._all]));
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        planId: r.planId,
        planName: r.plan?.name ?? null,
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
        patientCount: r._count.patients,
        suspendedCount: suspendedCounts.get(r.id) ?? 0,
      }));
    },

    async find(id) {
      const row = await tx.patientGroup.findUnique({ where: { id }, include });
      return row && toDomain(row);
    },

    async create(input) {
      return toDomain(await tx.patientGroup.create({ data: input, include }));
    },

    async update(id, input) {
      if (!(await tx.patientGroup.findUnique({ where: { id }, select: { id: true } }))) return null;
      return toDomain(await tx.patientGroup.update({ where: { id }, data: input, include }));
    },

    async confirm(id, at) {
      await tx.patientGroup.update({ where: { id }, data: { confirmedAt: at } });
    },

    async findExistingCodes(codes) {
      const rows = await tx.patient.findMany({ where: { code: { in: codes } }, select: { code: true } });
      return new Set(rows.map((r) => r.code));
    },

    async addPatients(groupId, codes) {
      await tx.patient.createMany({ data: codes.map((code) => ({ groupId, code })) });
    },

    async findPatient(id) {
      const row = await tx.patient.findUnique({ where: { id } });
      return row && toPatient(row);
    },

    async updatePatient(id, patch) {
      const { startDate, suspendedOn, ...rest } = patch;
      await tx.patient.update({
        where: { id },
        data: {
          ...rest,
          ...(startDate !== undefined && { startDate: toDate(startDate) }),
          ...(suspendedOn !== undefined && { suspendedOn: toDate(suspendedOn) }),
        },
      });
    },

    async deletePatient(id) {
      await tx.patient.delete({ where: { id } });
    },
  };
}
