import { Link } from 'react-router';
import type { RegimenTemplate } from '../api/client.ts';

/** レジメンのテンプレートから作るか、白紙から作るかを選ぶ */
export function TemplateChooser({ templates, to, blankLabel }: { templates: RegimenTemplate[]; to: string; blankLabel: string }) {
  return (
    <div className="card">
      <h4>新しく作る</h4>
      <div className="templates">
        {templates.map((t) => (
          <Link key={t.key} to={`${to}?template=${encodeURIComponent(t.key)}`} className="template">
            <strong>{t.name}</strong>
            <span>{t.disease}</span>
            <small>
              {t.plan.cycleLengthDays} 日周期・テンプレートから作る
            </small>
          </Link>
        ))}
        <Link to={to} className="template blank">
          <strong>{blankLabel}</strong>
        </Link>
      </div>
    </div>
  );
}
