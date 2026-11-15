import type { PlanInput } from '../../schemas/domain/plan.ts';
import type { Question } from '../../schemas/domain/questionnaire.ts';

// レジメンのテンプレート。docs/ のレジメンの資料(患者向け説明書)から、周期・薬剤・主な副作用を読み取って書いた。
// 質問票と治療計画の初期値を入れるためだけに使い、マスタの正にはしない(同じレジメンでも計画は変わる)。
// PRO-CTCAE の質問は、症状のコードだけを持つ。文言は DB の PRO-CTCAE マスタから入れる。

export type RegimenTemplateDefinition = {
  key: string;
  name: string;
  disease: string;
  source: string;
  questionnaire: {
    name: string;
    description: string;
    sections: { title: string; proCtcaeSymptoms: string[]; customQuestions: Question[] }[];
  };
  plan: PlanInput;
};

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const regimenTemplates: RegimenTemplateDefinition[] = [
  {
    key: 'capeox-bev',
    name: 'CapeOX(XELOX)±ベバシズマブ療法',
    disease: '大腸がん(結腸・直腸がん)',
    source: 'カペシタビン＋オキサリプラチン±ベバシズマブ療法(レジメン資料 f025)',
    questionnaire: {
      name: 'CapeOX±ベバシズマブ 症状チェック',
      description:
        '資料の「どんな副作用がいつごろみられる?」に挙がっている自覚症状(吐き気・食欲低下・倦怠感、下痢・口腔粘膜炎、手足のしびれ、皮膚症状、鼻出血)をもとにした質問票。',
      sections: [
        {
          title: '吐き気・食事・おなかの調子',
          proCtcaeSymptoms: ['NAUSEA', 'VOMITING', 'DECREASED_APPETITE', 'DIARRHEA', 'MOUTH_THROAT_SORES'],
          customQuestions: [],
        },
        { title: '手足・皮膚', proCtcaeSymptoms: ['NUMBNESS_TINGLING', 'HAND_FOOT_SYNDROME'], customQuestions: [] },
        {
          title: '全身の状態',
          proCtcaeSymptoms: ['FATIGUE', 'NOSEBLEED'],
          customQuestions: [
            {
              source: 'CUSTOM',
              proCtcaeCode: null,
              text: 'カペシタビンを飲み忘れた回数を教えてください(この 7 日間)。',
              answerType: 'NUMBER',
              options: [],
              required: false,
            },
            {
              source: 'CUSTOM',
              proCtcaeCode: null,
              text: 'そのほかに気になる症状や、医療者に伝えたいことがあれば書いてください。',
              answerType: 'TEXT',
              options: [],
              required: false,
            },
          ],
        },
      ],
    },
    plan: {
      name: 'CapeOX±ベバシズマブ療法',
      disease: '大腸がん(結腸・直腸がん)',
      regimenName: 'カペシタビン＋オキサリプラチン±ベバシズマブ',
      templateKey: 'capeox-bev',
      // 資料: 21 日間で 1 コース。14 日間投与し、7 日間休薬する
      cycleLengthDays: 21,
      // コースの数は資料にないので仮の値。計画ごとに決める
      cycleCount: 8,
      baselineDays: 7,
      drugs: [
        { name: 'ベバシズマブ(併用する場合)', route: 'IV', days: [1] },
        { name: 'オキサリプラチン', route: 'IV', days: [1] },
        { name: 'カペシタビン', route: 'ORAL', days: range(1, 14) },
      ],
      rules: [],
    },
  },
];
