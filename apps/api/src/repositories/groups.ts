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
      const rows = await tx.patientGroup.findMany({
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { name: true } }, patients: { select: { status: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        planId: r.planId,
        planName: r.plan?.name ?? null,
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
        patientCount: r.patients.length,
        suspendedCount: r.patients.filter((p) => p.status === 'SUSPENDED').length,
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

    async codeExists(code) {
      return (await tx.patient.count({ where: { code } })) > 0;
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
