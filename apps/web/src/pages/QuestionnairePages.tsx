import { Link, useLoaderData } from 'react-router';
import type { Catalog, Question, Questionnaire, QuestionnaireInput, QuestionnaireSummary } from '../api/client.ts';
import { DeleteForm } from '../forms/DeleteForm.tsx';
import { QuestionnaireForm } from '../forms/QuestionnaireForm.tsx';
import { TemplateChooser } from './TemplateChooser.tsx';

export function QuestionnaireListPage() {
  const { questionnaires, catalog } = useLoaderData() as { questionnaires: QuestionnaireSummary[]; catalog: Catalog };
  return (
    <div className="stack">
      <h2>質問票マスタ</h2>
      <p className="hint">ここに登録した質問票を、治療計画の配信スケジュールで選ぶ。</p>
      <TemplateChooser templates={catalog.regimenTemplates} to="/questionnaires/new" blankLabel="白紙から作る" />
      <table>
        <thead>
          <tr>
            <th>名前</th>
            <th>章(ページ)</th>
            <th>質問</th>
            <th>使っている治療計画</th>
            <th>更新</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {questionnaires.length === 0 && (
            <tr>
              <td colSpan={6} className="hint">
                まだない。上のテンプレートから作ると早い。
              </td>
            </tr>
          )}
          {questionnaires.map((q) => (
            <tr key={q.id}>
              <td>
                <Link to={`/questionnaires/${q.id}`}>{q.name}</Link>
                <div className="hint">{q.description}</div>
              </td>
              <td>{q.sectionCount}</td>
              <td>{q.questionCount}</td>
              <td>
                {q.usedByPlans.length === 0 && <span className="hint">なし</span>}
                {q.usedByPlans.map((plan) => (
                  <div key={plan.id}>
                    <Link to={`/plans/${plan.id}`}>{plan.name}</Link>
                  </div>
                ))}
              </td>
              <td>{q.updatedAt.slice(0, 10)}</td>
              <td>
                <DeleteForm kind="questionnaires" id={q.id} label={`質問票「${q.name}」`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const blank: QuestionnaireInput = {
  name: '',
  description: '',
  templateKey: null,
  sections: [{ title: '第 1 章', questions: [] }],
};

export function QuestionnaireEditPage() {
  const { catalog, questionnaire, templateKey } = useLoaderData() as {
    catalog: Catalog;
    questionnaire: Questionnaire | null;
    templateKey: string | null;
  };
  const template = catalog.regimenTemplates.find((t) => t.key === templateKey);
  const initial: QuestionnaireInput = questionnaire ?? template?.questionnaire ?? blank;
  return (
    <div className="stack">
      <h2>{questionnaire ? '質問票を編集する' : '質問票を新しく登録する'}</h2>
      {template && !questionnaire && (
        <p className="notice">
          テンプレート「{template.name}」の内容を入れてある。自由に編集してから登録する(テンプレート自体は変わらない)。
        </p>
      )}
      <QuestionnaireForm
        key={questionnaire?.id ?? templateKey ?? 'blank'}
        id={questionnaire?.id}
        initial={initial}
        proCtcae={catalog.proCtcae}
      />
    </div>
  );
}

const ANSWER_TYPE_LABEL: Record<Question['answerType'], string> = {
  SINGLE_CHOICE: '1 つ選ぶ',
  MULTI_CHOICE: '複数選ぶ',
  NUMBER: '数値を入力',
  TEXT: '自由記述',
};

/** 質問票のプレビュー。章(ページ)ごとに、質問と選択肢を一覧で見る。編集は「編集する」から */
export function QuestionnairePreviewPage() {
  const { questionnaire } = useLoaderData() as { questionnaire: Questionnaire };
  const total = questionnaire.sections.reduce((n, s) => n + s.questions.length, 0);
  let number = 0;
  return (
    <div className="stack">
      <div className="row">
        <h2 className="grow">{questionnaire.name}</h2>
        <Link to="/questionnaires" className="button">
          一覧へ戻る
        </Link>
        <Link to={`/questionnaires/${questionnaire.id}/edit`} className="button primary">
          編集する
        </Link>
      </div>
      {questionnaire.description && <p>{questionnaire.description}</p>}
      <p className="hint">
        {questionnaire.sections.length} 章(ページ)・{total} 問 / 更新 {questionnaire.updatedAt.slice(0, 10)}
      </p>
      {questionnaire.sections.length > 1 && (
        <nav className="row wrap">
          {questionnaire.sections.map((s, i) => (
            <a key={i} href={`#section-${i + 1}`} className="badge">
              {i + 1}. {s.title}({s.questions.length} 問)
            </a>
          ))}
        </nav>
      )}

      {questionnaire.sections.map((section, i) => (
        <section key={i} id={`section-${i + 1}`} className="card stack">
          <div className="row">
            <span className="badge">
              第 {i + 1} 章 / {i + 1} ページ目
            </span>
            <h3>{section.title}</h3>
          </div>
          <table className="preview">
            <thead>
              <tr>
                <th>No.</th>
                <th>質問</th>
                <th>回答</th>
                <th>種類</th>
              </tr>
            </thead>
            <tbody>
              {section.questions.map((q, j) => (
                <tr key={j}>
                  <td>{++number}</td>
                  <td>
                    {q.text}
                    {q.required && (
                      <span className="required" title="必須">
                        {' '}
                        必須
                      </span>
                    )}
                  </td>
                  <td>
                    {q.options.length > 0 ? (
                      <div className="chips">
                        {q.options.map((o) => (
                          <span key={o} className="option">
                            {o}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="hint">({ANSWER_TYPE_LABEL[q.answerType]})</span>
                    )}
                    {q.answerType === 'MULTI_CHOICE' && <div className="hint">複数選べる</div>}
                  </td>
                  <td>
                    <span className={q.source === 'PRO_CTCAE' ? 'badge pro' : 'badge'}>
                      {q.source === 'PRO_CTCAE' ? 'PRO-CTCAE' : '任意の質問'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
