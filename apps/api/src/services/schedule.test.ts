import { expect, test } from 'vitest';
import type { Plan } from '../schemas/domain/plan.ts';
import { computeSchedule } from './schedule.ts';

const Q = '00000000-0000-4000-8000-000000000001';
const plan: Plan = {
  id: '00000000-0000-4000-8000-0000000000aa',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'p',
  disease: '',
  regimenName: '',
  templateKey: null,
  cycleLengthDays: 21,
  cycleCount: 3,
  baselineDays: 7,
  drugs: [],
  rules: [
    { questionnaireId: Q, dayOffset: -7, windowDays: 7, cycleFrom: 1, cycleTo: null },
    { questionnaireId: Q, dayOffset: 7, windowDays: 3, cycleFrom: 1, cycleTo: null },
    { questionnaireId: Q, dayOffset: 14, windowDays: 2, cycleFrom: 2, cycleTo: 2 },
  ],
};
const base = { plan, questionnaireNames: new Map([[Q, '症状']]), patientId: Q, suspendedOn: null };

test('開始日がなければ、配信の予定はない', () => {
  expect(computeSchedule({ ...base, startDate: null, today: '2026-01-01' }).deliveries).toEqual([]);
});

test('患者の開始日から、コースごとの配信日と回答可能期間を計算する', () => {
  const s = computeSchedule({ ...base, startDate: '2026-01-10', today: '2026-01-18' });
  expect(s.deliveries.map((d) => [d.cycle, d.opensOn, d.closesOn, d.status])).toEqual([
    [0, '2026-01-03', '2026-01-09', 'CLOSED'],
    [1, '2026-01-17', '2026-01-19', 'OPEN'],
    [2, '2026-02-07', '2026-02-09', 'SCHEDULED'],
    [2, '2026-02-14', '2026-02-15', 'SCHEDULED'],
    [3, '2026-02-28', '2026-03-02', 'SCHEDULED'],
  ]);
  expect([s.currentCycle, s.currentDay]).toEqual([1, 9]);
  // 治療開始前の配信だけが、ベースラインの分類になる
  expect(s.deliveries.map((d) => d.phase)).toEqual(['BASELINE', 'TREATMENT', 'TREATMENT', 'TREATMENT', 'TREATMENT']);
});

test('開始日が違う患者は、同じ周期で日程だけがずれる', () => {
  const a = computeSchedule({ ...base, startDate: '2026-01-10', today: '2026-01-01' });
  const b = computeSchedule({ ...base, startDate: '2026-01-15', today: '2026-01-01' });
  expect(b.deliveries.map((d) => d.opensOn)).toEqual(
    a.deliveries.map((d) => new Date(Date.parse(d.opensOn) + 5 * 86_400_000).toISOString().slice(0, 10)),
  );
});

test('中断した日より後に始まる配信は停止し、すでに始まった配信は止めない', () => {
  const s = computeSchedule({ ...base, startDate: '2026-01-10', suspendedOn: '2026-01-17', today: '2026-01-18' });
  expect(s.deliveries.map((d) => d.status)).toEqual(['CLOSED', 'OPEN', 'STOPPED', 'STOPPED', 'STOPPED']);
});

test('治療の期間の外では、今のコースは null', () => {
  const s = computeSchedule({ ...base, startDate: '2026-01-10', today: '2026-06-01' });
  expect([s.currentCycle, s.currentDay]).toEqual([null, null]);
});
