import type { Question } from '../schemas/domain/questionnaire.ts';
import { loadProCtcaeMaster, resolveTemplate } from './catalog.ts';
import { regimenTemplates } from './catalog/regimen-templates.ts';
import type { Repositories, RequestContext, UnitOfWork } from './ports/index.ts';

const SAMPLE_PREFIX = '【サンプル】';

// サンプルの質問票の名前。一覧や配信スケジュールのボードで見分けやすいよう、短い名前にする
// テンプレートから作る質問票(テンプレートのキーごと)
const TEMPLATE_QUESTIONNAIRE_NAMES: Record<string, string> = { 'capeox-bev': 'PRO-CTCAE（A set）' };

// サンプルの配信スケジュール(1 コース 21 日)。配信日はレジメンの資料にはなく、画面の見本として置いたもの
const SAMPLE_RULES = [
  { dayOffset: -7, windowDays: 7 }, // ベースライン: 治療開始前の 7 日間
  { dayOffset: 7, windowDays: 3 }, // 8 日目から 3 日間
  { dayOffset: 14, windowDays: 3 }, // 15 日目(休薬に入る日)から 3 日間
];

// レジメンによらない質問票のサンプル。PRO-CTCAE の質問は症状のコードだけを持ち、文言はマスタから入れる
const SAMPLE_QUESTIONNAIRES: { name: string; description: string; sections: { title: string; proCtcaeSymptoms: string[]; customQuestions: Question[] }[] }[] = [
  {
    name: 'PRO-CTCAE（B set）',
    description: 'レジメンによらず使える、短い質問票。痛み・だるさ・睡眠・気分を 2 ページで尋ねる。',
    sections: [
      { title: 'からだの調子', proCtcaeSymptoms: ['GENERAL_PAIN', 'FATIGUE', 'INSOMNIA'], customQuestions: [] },
      {
        title: '気分・そのほか',
        proCtcaeSymptoms: ['ANXIOUS'],
        customQuestions: [
          {
            source: 'CUSTOM',
            proCtcaeCode: null,
            text: '次の診察で、医療者に相談したいことはありますか。',
            answerType: 'SINGLE_CHOICE',
            options: ['ある', 'ない'],
            required: true,
          },
          {
            source: 'CUSTOM',
            proCtcaeCode: null,
            text: '相談したいことがあれば、内容を書いてください。',
            answerType: 'TEXT',
            options: [],
            required: false,
          },
        ],
      },
    ],
  },
];

/**
 * 治療計画のサンプル(と、その配信スケジュールで使う質問票)と、質問票のサンプルを登録する。
 * 同じ名前のものがあれば、それは登録しないので、何度実行してもよい。PRO-CTCAE マスタが要る。
 */
export function createSeedService(uow: UnitOfWork<Pick<Repositories, 'proCtcae' | 'questionnaires' | 'plans'>>) {
  return {
    seedSamples: (ctx: RequestContext) =>
      uow.run(ctx, async ({ proCtcae, questionnaires, plans }) => {
        const symptoms = new Map((await loadProCtcaeMaster(proCtcae)).map((s) => [s.code, s]));
        const existingPlans = new Set((await plans.list()).map((p) => p.name));
        const existingQuestionnaires = new Map((await questionnaires.list()).map((q) => [q.name, q.id]));
        const created: string[] = [];

        for (const definition of regimenTemplates) {
          const template = resolveTemplate(definition, symptoms);
          const planName = SAMPLE_PREFIX + template.plan.name;
          if (existingPlans.has(planName)) continue;

          const questionnaireName = TEMPLATE_QUESTIONNAIRE_NAMES[template.key] ?? SAMPLE_PREFIX + template.questionnaire.name;
          const questionnaireId =
            existingQuestionnaires.get(questionnaireName) ??
            (await questionnaires.create({ ...template.questionnaire, name: questionnaireName })).id;
          await plans.create({
            ...template.plan,
            name: planName,
            rules: SAMPLE_RULES.map((r) => ({ ...r, questionnaireId, cycleFrom: 1, cycleTo: null })),
          });
          created.push(planName);
        }

        for (const sample of SAMPLE_QUESTIONNAIRES) {
          const { name } = sample;
          if (existingQuestionnaires.has(name)) continue;
          const itemsOf = (code: string) => {
            const symptom = symptoms.get(code);
            if (!symptom) throw new Error(`質問票のサンプル「${sample.name}」が使う症状 ${code} が、PRO-CTCAE マスタにない`);
            return symptom.items;
          };
          await questionnaires.create({
            name,
            description: sample.description,
            templateKey: null,
            sections: sample.sections.map((s) => ({
              title: s.title,
              questions: [...s.proCtcaeSymptoms.flatMap(itemsOf), ...s.customQuestions],
            })),
          });
          created.push(name);
        }
        return created;
      }),
  };
}
