import type { Delivery, PatientSchedule } from '../schemas/domain/group.ts';
import type { Plan } from '../schemas/domain/plan.ts';

// 日付は 'YYYY-MM-DD' の文字列で扱う(時刻とタイムゾーンを持たない)。文字列のまま大小を比べられる。

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

type ScheduleInput = {
  plan: Plan;
  questionnaireNames: Map<string, string>;
  patientId: string;
  /** 治療開始日(1 コース目の 1 日目) */
  startDate: string | null;
  /** 中断した日。この日より後に始まる配信は停止する。すでに始まっている配信は止めない */
  suspendedOn: string | null;
  today: string;
};

/** 治療計画の配信ルールと患者の開始日から、その患者への配信の予定を計算する */
export function computeSchedule(input: ScheduleInput): PatientSchedule {
  const { plan, startDate, suspendedOn, today } = input;
  if (!startDate) return { patientId: input.patientId, currentCycle: null, currentDay: null, deliveries: [] };

  const deliveries: Delivery[] = [];
  const push = (questionnaireId: string, cycle: number, opensOn: string, windowDays: number) => {
    const closesOn = addDays(opensOn, windowDays - 1);
    const status =
      suspendedOn !== null && opensOn > suspendedOn
        ? 'STOPPED'
        : today < opensOn
          ? 'SCHEDULED'
          : today <= closesOn
            ? 'OPEN'
            : 'CLOSED';
    deliveries.push({
      questionnaireId,
      questionnaireName: input.questionnaireNames.get(questionnaireId) ?? '',
      phase: cycle === 0 ? 'BASELINE' : 'TREATMENT',
      cycle,
      opensOn,
      closesOn,
      status,
    });
  };

  for (const rule of plan.rules) {
    if (rule.dayOffset < 0) {
      push(rule.questionnaireId, 0, addDays(startDate, rule.dayOffset), rule.windowDays);
      continue;
    }
    const to = Math.min(rule.cycleTo ?? plan.cycleCount, plan.cycleCount);
    for (let cycle = rule.cycleFrom; cycle <= to; cycle++) {
      const opensOn = addDays(startDate, (cycle - 1) * plan.cycleLengthDays + rule.dayOffset);
      push(rule.questionnaireId, cycle, opensOn, rule.windowDays);
    }
  }
  deliveries.sort((a, b) => a.opensOn.localeCompare(b.opensOn) || a.questionnaireName.localeCompare(b.questionnaireName));

  const elapsed = diffDays(startDate, today);
  const inTreatment = elapsed >= 0 && elapsed < plan.cycleLengthDays * plan.cycleCount;
  return {
    patientId: input.patientId,
    currentCycle: inTreatment ? Math.floor(elapsed / plan.cycleLengthDays) + 1 : null,
    currentDay: inTreatment ? (elapsed % plan.cycleLengthDays) + 1 : null,
    deliveries,
  };
}
