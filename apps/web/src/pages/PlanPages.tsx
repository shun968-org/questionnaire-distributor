import { Link, useLoaderData } from 'react-router';
import type { Catalog, Plan, PlanInput, PlanSummary, QuestionnaireSummary } from '../api/client.ts';
import { DeleteForm } from '../forms/DeleteForm.tsx';
import { PlanForm } from '../forms/PlanForm.tsx';
import { TemplateChooser } from './TemplateChooser.tsx';

export function PlanListPage() {
  const { plans, catalog } = useLoaderData() as { plans: PlanSummary[]; catalog: Catalog };
  return (
    <div className="stack">
      <h2>治療計画</h2>
      <p className="hint">疾患・薬剤セットごとの周期と、質問票の配信スケジュール。患者グループに適用する。</p>
      <TemplateChooser templates={catalog.regimenTemplates} to="/plans/new" blankLabel="白紙から作る" />
      <table>
        <thead>
          <tr>
            <th>名前</th>
            <th>疾患</th>
            <th>周期</th>
            <th>配信</th>
            <th>適用グループ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {plans.length === 0 && (
            <tr>
              <td colSpan={6} className="hint">
                まだない。
              </td>
            </tr>
          )}
          {plans.map((p) => (
            <tr key={p.id}>
              <td>
                <Link to={`/plans/${p.id}`}>{p.name}</Link>
                <div className="hint">{p.regimenName}</div>
              </td>
              <td>{p.disease}</td>
              <td>
                {p.cycleLengthDays} 日 × {p.cycleCount} コース
              </td>
              <td>{p.ruleCount} 件 / コース</td>
              <td>{p.groupCount}</td>
              <td>
                <DeleteForm kind="plans" id={p.id} label={`治療計画「${p.name}」`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const blank: PlanInput = {
  name: '',
  disease: '',
  regimenName: '',
  templateKey: null,
  cycleLengthDays: 21,
  cycleCount: 6,
  baselineDays: 7,
  drugs: [],
  rules: [],
};

export function PlanEditPage() {
  const { catalog, plan, questionnaires, templateKey } = useLoaderData() as {
    catalog: Catalog;
    plan: Plan | null;
    questionnaires: QuestionnaireSummary[];
    templateKey: string | null;
  };
  const template = catalog.regimenTemplates.find((t) => t.key === templateKey);
  return (
    <div className="stack">
      <h2>{plan ? '治療計画を編集する' : '治療計画を新しく登録する'}</h2>
      {template && !plan && (
        <p className="notice">
          テンプレート「{template.name}」の周期と薬剤を入れてある(もとの資料: {template.source})。コース数は仮の値なので、計画に合わせて直す。
        </p>
      )}
      <PlanForm
        key={plan?.id ?? templateKey ?? 'blank'}
        id={plan?.id}
        initial={plan ?? template?.plan ?? blank}
        questionnaires={questionnaires}
      />
    </div>
  );
}
