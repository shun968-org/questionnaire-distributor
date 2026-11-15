import { useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import type { Delivery, GroupDetail, GroupSummary, PlanSummary } from '../api/client.ts';
import {
  AddPatientsForm,
  ConfirmGroupForm,
  GroupForm,
  PatientActionForm,
  StartDateForm,
  SuspendForm,
} from '../forms/GroupForms.tsx';

export function GroupListPage() {
  const { groups, plans } = useLoaderData() as { groups: GroupSummary[]; plans: PlanSummary[] };
  return (
    <div className="stack">
      <h2>患者グループ</h2>
      <p className="hint">治療計画を適用する単位。周期はグループで同じで、治療開始日は患者ごとに設定する。</p>
      <div className="card">
        <h4>新しく作る</h4>
        <GroupForm initial={{ name: '', planId: null }} plans={plans} />
      </div>
      <table>
        <thead>
          <tr>
            <th>名前</th>
            <th>治療計画</th>
            <th>患者</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr>
              <td colSpan={4} className="hint">
                まだない。
              </td>
            </tr>
          )}
          {groups.map((g) => (
            <tr key={g.id}>
              <td>
                <Link to={`/groups/${g.id}`}>{g.name}</Link>
              </td>
              <td>{g.planName ?? <span className="hint">未選択</span>}</td>
              <td>
                {g.patientCount} 人{g.suspendedCount > 0 && `(中断 ${g.suspendedCount})`}
              </td>
              <td>{g.confirmedAt ? <span className="badge ok">確定済み</span> : <span className="badge">患者を割り当て中</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_LABEL: Record<Delivery['status'], string> = {
  SCHEDULED: '配信前',
  OPEN: '回答可能',
  CLOSED: '期間終了',
  STOPPED: '停止',
};

const DAY = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dayDiff = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY);
const shift = (date: string, days: number) => new Date(toTime(date) + days * DAY).toISOString().slice(0, 10);

export function GroupDetailPage() {
  const { detail, plans } = useLoaderData() as { detail: GroupDetail; plans: PlanSummary[] };
  const { group, plan, schedules, today } = detail;
  const [suspending, setSuspending] = useState<string | null>(null);
  const confirmed = group.confirmedAt !== null;
  const scheduleByPatient = new Map(schedules.map((s) => [s.patientId, s]));
  const scheduleOf = (patientId: string) => scheduleByPatient.get(patientId);
  const suspendingPatient = group.patients.find((p) => p.id === suspending);

  return (
    <div className="stack">
      <h2>
        {group.name} {confirmed ? <span className="badge ok">確定済み</span> : <span className="badge">患者を割り当て中</span>}
      </h2>

      <section className="card stack">
        <GroupForm key={`${group.planId}-${confirmed}`} id={group.id} initial={group} plans={plans} planLocked={confirmed} />
        {plan && (
          <p className="hint">
            治療計画: <Link to={`/plans/${plan.id}`}>{plan.name}</Link>({plan.cycleLengthDays} 日 × {plan.cycleCount} コース、1
            コースに配信 {plan.rules.length} 件)
          </p>
        )}
      </section>

      <section className="card stack">
        <h3>患者({group.patients.length} 人)</h3>
        {confirmed ? (
          <p className="hint">{group.confirmedAt!.slice(0, 10)} に患者を確定した。追加はできない。</p>
        ) : (
          <>
            <AddPatientsForm groupId={group.id} />
            <ConfirmGroupForm
              groupId={group.id}
              disabledReason={
                !group.planId ? '治療計画を選ぶと確定できる。' : group.patients.length === 0 ? '患者を割り当てると確定できる。' : undefined
              }
            />
          </>
        )}
        <table>
          <thead>
            <tr>
              <th>患者 ID</th>
              <th>治療開始日</th>
              <th>進行</th>
              <th>次の配信</th>
              <th>状態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {group.patients.map((p) => {
              const schedule = scheduleOf(p.id);
              const next = schedule?.deliveries.find((d) => d.status === 'OPEN' || d.status === 'SCHEDULED');
              return (
                <tr key={p.id}>
                  <td>
                    <code>{p.code}</code>
                  </td>
                  <td>
                    <StartDateForm key={`${p.startDate}-${p.status}`} patient={p} />
                  </td>
                  <td>
                    {!plan
                      ? '治療計画が未選択'
                      : !p.startDate
                        ? '開始日が未設定'
                        : schedule?.currentCycle
                          ? `${schedule.currentCycle} コース目・${schedule.currentDay} 日目`
                          : p.startDate > today
                            ? `開始まで ${dayDiff(today, p.startDate)} 日`
                            : '全コースの期間が終了'}
                  </td>
                  <td>
                    {next ? (
                      <>
                        {next.phase === 'BASELINE' && <span className="badge baseline">ベースライン</span>} {next.questionnaireName}
                        <div className="hint">
                          {next.opensOn}〜{next.closesOn}({STATUS_LABEL[next.status]})
                        </div>
                      </>
                    ) : (
                      <span className="hint">なし</span>
                    )}
                  </td>
                  <td>
                    {p.status === 'SUSPENDED' ? (
                      <>
                        <span className="badge stop">中断({p.suspendedOn})</span>
                        <div className="hint">{p.suspendReason}</div>
                      </>
                    ) : (
                      <span className="badge ok">治療中</span>
                    )}
                  </td>
                  <td>
                    <div className="row">
                      {p.status === 'SUSPENDED' ? (
                        <PatientActionForm patient={p} action="cancelSuspension" />
                      ) : (
                        <button type="button" onClick={() => setSuspending(p.id)}>
                          中断…
                        </button>
                      )}
                      {!confirmed && <PatientActionForm patient={p} action="remove" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {suspendingPatient && (
          <SuspendForm key={suspendingPatient.id} patient={suspendingPatient} today={today} onDone={() => setSuspending(null)} />
        )}
      </section>

      <section className="card stack">
        <h3>配信の予定(患者ごと)</h3>
        <ScheduleTimeline detail={detail} />
      </section>
    </div>
  );
}

/** 患者ごとの配信の予定を、日付の軸に並べる。開始日が違うと、同じ周期のまま左右にずれる */
function ScheduleTimeline({ detail }: { detail: GroupDetail }) {
  const { group, plan, schedules, today } = detail;
  const deliveries = schedules.flatMap((s) => s.deliveries);
  const scheduleByPatient = new Map(schedules.map((s) => [s.patientId, s]));
  if (!plan) return <p className="hint">治療計画を選ぶと、配信の予定が出る。</p>;
  if (deliveries.length === 0) return <p className="hint">治療開始日を設定すると、その患者の配信の予定が出る。</p>;

  const W = 9;
  const from = shift(deliveries.reduce((min, d) => (d.opensOn < min ? d.opensOn : min), today), -2);
  const to = shift(deliveries.reduce((max, d) => (d.closesOn > max ? d.closesOn : max), today), 2);
  const total = dayDiff(from, to) + 1;
  const x = (date: string) => dayDiff(from, date) * W;
  const months: { label: string; left: number }[] = [];
  for (let i = 0; i < total; i++) {
    const date = shift(from, i);
    if (i === 0 || date.endsWith('-01')) months.push({ label: date.slice(0, 7), left: i * W });
  }

  return (
    <>
      <div className="legend">
        {(['treatment', 'baseline'] as const).map((phase) => (
          <span key={phase} className="legend-group">
            <strong>{phase === 'baseline' ? 'ベースライン(治療開始前)' : '治療中'}</strong>
            {(Object.keys(STATUS_LABEL) as Delivery['status'][]).map((s) => (
              <span key={s}>
                <i className={`swatch ${phase} ${s.toLowerCase()}`} />
                {STATUS_LABEL[s]}
              </span>
            ))}
          </span>
        ))}
        <span>
          <i className="swatch cycle" />
          コースの区切り
        </span>
        <span>
          <i className="swatch today" />
          今日
        </span>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-row">
          <div className="timeline-label" />
          <div className="timeline-track head" style={{ width: total * W }}>
            {months.map((m) => (
              <span key={m.left} style={{ left: m.left }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
        {group.patients.map((p) => {
          const schedule = scheduleByPatient.get(p.id);
          return (
            <div key={p.id} className="timeline-row">
              <div className="timeline-label">
                <code>{p.code}</code>
              </div>
              <div className="timeline-track" style={{ width: total * W }}>
                <div className="today-line" style={{ left: x(today) }} />
                {p.startDate &&
                  Array.from({ length: plan.cycleCount + 1 }, (_, c) => shift(p.startDate!, c * plan.cycleLengthDays))
                    .filter((d) => d >= from && d <= to)
                    .map((d) => <div key={d} className="cycle-line" style={{ left: x(d) }} />)}
                {p.suspendedOn && p.suspendedOn >= from && p.suspendedOn <= to && (
                  <div className="suspend-line" style={{ left: x(p.suspendedOn) + W }} title={`中断 ${p.suspendedOn}`} />
                )}
                {schedule?.deliveries.map((d, i) => (
                  <div
                    key={i}
                    className={`delivery ${d.phase.toLowerCase()} ${d.status.toLowerCase()}`}
                    style={{ left: x(d.opensOn), width: (dayDiff(d.opensOn, d.closesOn) + 1) * W - 1 }}
                    title={`${d.questionnaireName} / ${d.phase === 'BASELINE' ? 'ベースライン(治療開始前)' : `${d.cycle} コース目`} / ${d.opensOn}〜${d.closesOn} / ${STATUS_LABEL[d.status]}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
