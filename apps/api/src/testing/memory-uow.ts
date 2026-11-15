// テスト用の、メモリ上の Unit of Work(ADR-0002: service の単体テストは、偽の Unit of Work を渡して書く)。
// トランザクションは再現しない(失敗しても巻き戻さない)。
import type { ProCtcaeSymptom } from '../schemas/domain/catalog.ts';
import type { Group, Patient } from '../schemas/domain/group.ts';
import type { Plan } from '../schemas/domain/plan.ts';
import type { Questionnaire } from '../schemas/domain/questionnaire.ts';
import type { Repositories, UnitOfWork } from '../services/ports/index.ts';

export function createMemoryUnitOfWork(): UnitOfWork {
  let proCtcae: ProCtcaeSymptom[] = [];
  const questionnaires = new Map<string, Questionnaire>();
  const plans = new Map<string, Plan>();
  const groups = new Map<string, Omit<Group, 'patients'>>();
  const patients = new Map<string, Patient>();
  const now = () => new Date().toISOString();
  const withPatients = (g: Omit<Group, 'patients'>): Group => ({
    ...g,
    patients: [...patients.values()].filter((p) => p.groupId === g.id),
  });

  const repos: Repositories = {
    proCtcae: {
      list: async () => proCtcae,
      replaceAll: async (symptoms) => {
        proCtcae = symptoms;
      },
    },
    questionnaires: {
      list: async () =>
        [...questionnaires.values()].map((q) => ({
          id: q.id,
          name: q.name,
          description: q.description,
          sectionCount: q.sections.length,
          questionCount: q.sections.reduce((n, s) => n + s.questions.length, 0),
          usedByPlans: [...plans.values()]
            .filter((p) => p.rules.some((r) => r.questionnaireId === q.id))
            .map((p) => ({ id: p.id, name: p.name })),
          updatedAt: q.updatedAt,
        })),
      find: async (id) => questionnaires.get(id) ?? null,
      findNames: async (ids) =>
        new Map(ids.flatMap((id) => (questionnaires.has(id) ? [[id, questionnaires.get(id)!.name] as const] : []))),
      create: async (input) => {
        const q = { ...input, id: crypto.randomUUID(), updatedAt: now() };
        questionnaires.set(q.id, q);
        return q;
      },
      update: async (id, input) => {
        if (!questionnaires.has(id)) return null;
        const q = { ...input, id, updatedAt: now() };
        questionnaires.set(id, q);
        return q;
      },
      delete: async (id) => questionnaires.delete(id),
      isUsed: async (id) => [...plans.values()].some((p) => p.rules.some((r) => r.questionnaireId === id)),
    },
    plans: {
      list: async () =>
        [...plans.values()].map((p) => ({
          id: p.id,
          name: p.name,
          disease: p.disease,
          regimenName: p.regimenName,
          cycleLengthDays: p.cycleLengthDays,
          cycleCount: p.cycleCount,
          ruleCount: p.rules.length,
          groupCount: [...groups.values()].filter((g) => g.planId === p.id).length,
          updatedAt: p.updatedAt,
        })),
      find: async (id) => plans.get(id) ?? null,
      create: async (input) => {
        const p = { ...input, id: crypto.randomUUID(), updatedAt: now() };
        plans.set(p.id, p);
        return p;
      },
      update: async (id, input) => {
        if (!plans.has(id)) return null;
        const p = { ...input, id, updatedAt: now() };
        plans.set(id, p);
        return p;
      },
      delete: async (id) => plans.delete(id),
      isUsed: async (id) => [...groups.values()].some((g) => g.planId === id),
    },
    groups: {
      list: async () =>
        [...groups.values()].map(withPatients).map((g) => ({
          id: g.id,
          name: g.name,
          planId: g.planId,
          planName: g.planId ? (plans.get(g.planId)?.name ?? null) : null,
          confirmedAt: g.confirmedAt,
          patientCount: g.patients.length,
          suspendedCount: g.patients.filter((p) => p.status === 'SUSPENDED').length,
        })),
      find: async (id) => {
        const g = groups.get(id);
        return g ? withPatients(g) : null;
      },
      create: async (input) => {
        const g = { ...input, id: crypto.randomUUID(), confirmedAt: null };
        groups.set(g.id, g);
        return withPatients(g);
      },
      update: async (id, input) => {
        const g = groups.get(id);
        if (!g) return null;
        Object.assign(g, input);
        return withPatients(g);
      },
      confirm: async (id, at) => {
        groups.get(id)!.confirmedAt = at.toISOString();
      },
      findExistingCodes: async (codes) => new Set([...patients.values()].map((p) => p.code).filter((code) => codes.includes(code))),
      addPatients: async (groupId, codes) => {
        for (const code of codes) {
          const id = crypto.randomUUID();
          patients.set(id, { id, groupId, code, startDate: null, status: 'ACTIVE', suspendedOn: null, suspendReason: '' });
        }
      },
      findPatient: async (id) => patients.get(id) ?? null,
      updatePatient: async (id, patch) => {
        Object.assign(patients.get(id)!, patch);
      },
      deletePatient: async (id) => {
        patients.delete(id);
      },
    },
  };

  return { run: (_ctx, fn) => fn(repos) };
}
