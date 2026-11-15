// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import type { DeliveryRule, Drug, ProCtcaeSymptom, QuestionnaireInput, QuestionnaireSummary } from '../api/client.ts';
import { api } from '../api/client.ts';
import { PlanForm } from './PlanForm.tsx';
import { QuestionnaireForm } from './QuestionnaireForm.tsx';
import { ScheduleBoard } from './ScheduleBoard.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const choice = (text: string, code: string | null = null) => ({
  source: code ? ('PRO_CTCAE' as const) : ('CUSTOM' as const),
  proCtcaeCode: code,
  text,
  answerType: 'SINGLE_CHOICE' as const,
  options: ['なし', 'あり'],
  required: true,
});
const proCtcae: ProCtcaeSymptom[] = [
  { code: 'NAUSEA', no: 1, term: 'Nausea', label: '吐き気', note: null, category: '消化器', items: [choice('吐き気の頻度', 'NAUSEA:FREQ'), choice('吐き気の程度', 'NAUSEA:SEV')] },
  { code: 'FATIGUE', no: 2, term: 'Fatigue', label: '疲労感', note: null, category: '全身', items: [choice('疲労感の程度', 'FATIGUE:SEV')] },
];
const Q1 = '00000000-0000-4000-8000-000000000001';
const Q2 = '00000000-0000-4000-8000-000000000002';
const questionnaires: QuestionnaireSummary[] = [
  { id: Q1, name: '症状チェック', description: '', sectionCount: 2, questionCount: 5, usedByPlans: [], updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: Q2, name: '簡易チェック', description: '', sectionCount: 1, questionCount: 3, usedByPlans: [], updatedAt: '2026-01-01T00:00:00.000Z' },
];

const inRouter = (element: React.ReactNode) =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element }])} />);

test('質問票: テンプレートの内容を編集し、章と PRO-CTCAE の症状を足して登録できる', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api.questionnaires, 'create').mockResolvedValue({ id: Q1 } as never);
  const initial: QuestionnaireInput = {
    name: 'テンプレートの質問票',
    description: '',
    templateKey: 'capeox-bev',
    sections: [{ title: '消化器', questions: proCtcae[0]!.items }],
  };
  inRouter(<QuestionnaireForm initial={initial} proCtcae={proCtcae} />);

  await user.clear(screen.getByLabelText('質問票の名前'));
  await user.type(screen.getByLabelText('質問票の名前'), '編集した質問票');

  // 章(ページ)を足し、その章に症状を足す
  await user.click(screen.getByRole('button', { name: '+ 章(ページ)を追加' }));
  const first = screen.getByText('第 1 章 / 1 ページ目').closest('section')!;
  const second = screen.getByText('第 2 章 / 2 ページ目').closest('section')!;
  await user.click(within(second).getByRole('button', { name: '+ PRO-CTCAE の症状から追加' }));
  expect(within(second).getByText(/追加済み/)).toBeTruthy(); // 吐き気は 1 章で使っている
  await user.click(within(second).getByLabelText(/疲労感/));
  await user.click(within(second).getByRole('button', { name: /この章に追加/ }));
  // 任意の質問も足す
  await user.click(within(second).getByRole('button', { name: '+ 任意の質問を追加' }));
  // PRO-CTCAE の質問は文言を編集できないので、質問文の入力欄は任意の質問の 1 つだけ
  await user.type(within(second).getByLabelText('質問文'), '気になることはありますか');
  expect(within(first).queryByLabelText('質問文')).toBeNull();

  // 1 章の 2 問目を 2 章へ移す
  await user.selectOptions(within(first).getAllByLabelText('章を移動')[1]!, '1');

  await user.click(screen.getByRole('button', { name: '質問票マスタに登録する' }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  const sent = create.mock.calls[0]![0];
  expect(sent.name).toBe('編集した質問票');
  expect(sent.sections.map((s) => s.questions.map((q) => q.text))).toEqual([
    ['吐き気の頻度'],
    ['疲労感の程度', '気になることはありますか', '吐き気の程度'],
  ]);
});

test('質問票: 質問のない章があると、登録せずにエラーを出す', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api.questionnaires, 'create').mockResolvedValue({ id: Q1 } as never);
  inRouter(
    <QuestionnaireForm initial={{ name: 'x', description: '', templateKey: null, sections: [{ title: '章', questions: [] }] }} proCtcae={proCtcae} />,
  );
  await user.click(screen.getByRole('button', { name: '質問票マスタに登録する' }));
  expect(await screen.findByText('章に質問を 1 つ以上入れる')).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});

function Board({ initialRules = [] as DeliveryRule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [drugs, setDrugs] = useState<Drug[]>([{ name: 'カペシタビン', route: 'ORAL', days: [1, 2] }]);
  return (
    <>
      <ScheduleBoard
        cycleLengthDays={21}
        cycleCount={8}
        baselineDays={7}
        questionnaires={questionnaires}
        drugs={drugs}
        onDrugsChange={setDrugs}
        rules={rules}
        onRulesChange={setRules}
      />
      <output data-testid="rules">{JSON.stringify(rules)}</output>
      <output data-testid="drugs">{JSON.stringify(drugs)}</output>
    </>
  );
}
const rulesNow = () => JSON.parse(screen.getByTestId('rules').textContent!) as DeliveryRule[];

// jsdom はレイアウトを持たないので、トラックの左端は x=0。1 日の幅は 34px、ベースラインが 7 日
// jsdom には DragEvent がなく、fireEvent に渡した座標が落ちるので、イベントに直接持たせる
const dropAt = (target: Element, clientX: number) => {
  const dataTransfer = { types: ['application/x-questionnaire-id'], getData: () => Q1 };
  for (const create of [createEvent.dragOver, createEvent.drop]) {
    const event = create(target);
    Object.defineProperties(event, { clientX: { value: clientX }, dataTransfer: { value: dataTransfer } });
    fireEvent(target, event);
  }
};

test('ボード: 質問票をドラッグして置き、動かし、右端で回答可能期間を変える', () => {
  const { container } = inRouter(<Board />);
  const dropzone = container.querySelector('.track.dropzone')!;

  dropAt(dropzone, 34 * (7 + 7) + 5); // 8 日目のマス
  // 初めて置いた質問票には、ベースラインの配信(ベースライン期間の全体)も付く
  expect(rulesNow()).toEqual([
    { questionnaireId: Q1, dayOffset: 7, windowDays: 3, cycleFrom: 1, cycleTo: null },
    { questionnaireId: Q1, dayOffset: -7, windowDays: 7, cycleFrom: 1, cycleTo: null },
  ]);

  // バーを右へ 2 日分ドラッグする
  const bar = container.querySelector('.bar')! as HTMLElement;
  bar.setPointerCapture = () => {};
  fireEvent.pointerDown(bar, { button: 0, clientX: 500, pointerId: 1 });
  fireEvent.pointerMove(bar, { clientX: 500 + 68, pointerId: 1 });
  fireEvent.pointerUp(bar, { pointerId: 1 });
  expect(rulesNow()[0]).toMatchObject({ dayOffset: 9, windowDays: 3 });

  // 右端をドラッグして、回答可能期間を 3 日から 5 日にする
  const handle = container.querySelector('.bar-handle')! as HTMLElement;
  handle.setPointerCapture = () => {};
  fireEvent.pointerDown(handle, { button: 0, clientX: 600, pointerId: 2 });
  fireEvent.pointerMove(handle, { clientX: 600 + 70, pointerId: 2 });
  fireEvent.pointerUp(handle, { pointerId: 2 });
  expect(rulesNow()[0]).toMatchObject({ dayOffset: 9, windowDays: 5 });

  // コースの終わりを超えては動かせない(期間がコースに収まるように縮む)
  fireEvent.pointerDown(bar, { button: 0, clientX: 0, pointerId: 3 });
  fireEvent.pointerMove(bar, { clientX: 34 * 40, pointerId: 3 });
  fireEvent.pointerUp(bar, { pointerId: 3 });
  expect(rulesNow()[0]).toMatchObject({ dayOffset: 20, windowDays: 1 });
});

test('ボード: ベースラインに置いた配信は期間内に収まり、数値でも調整・削除できる', async () => {
  const user = userEvent.setup();
  const { container } = inRouter(<Board />);
  dropAt(container.querySelector('.track.dropzone')!, 34 * 5 + 1); // 治療開始の 2 日前
  expect(rulesNow()[0]).toMatchObject({ dayOffset: -2, windowDays: 2 });
  expect(screen.getByText('ベースライン: 治療開始前に 1 回だけ配信する')).toBeTruthy();
  // ベースラインの配信は、治療中の配信と塗り分ける。コースの中へ動かすと、治療中の配信になる
  expect(container.querySelector('.bar')!.classList.contains('baseline')).toBe(true);

  await user.selectOptions(screen.getByLabelText('配信日'), '0');
  expect(rulesNow()[0]).toMatchObject({ dayOffset: 0, windowDays: 2 });
  expect(container.querySelector('.bar')!.classList.contains('baseline')).toBe(false);
  await user.click(screen.getByLabelText('最後のコースまで'));
  expect(rulesNow()[0]).toMatchObject({ cycleFrom: 1, cycleTo: 8 });

  await user.click(screen.getByRole('button', { name: '症状チェック の配信を外す' })); // バーの ×
  expect(rulesNow()).toEqual([]);
});

test('ボード: 薬剤の行は、マスのクリックで投与日を切り替える', async () => {
  const user = userEvent.setup();
  inRouter(<Board />);
  await user.click(screen.getByRole('button', { name: 'カペシタビン 3 日目' }));
  await user.click(screen.getByRole('button', { name: 'カペシタビン 1 日目' }));
  expect(JSON.parse(screen.getByTestId('drugs').textContent!)[0].days).toEqual([2, 3]);
});

test('治療計画: 周期を縮めて配信がはみ出すと、登録せずにエラーを出す。範囲に収めると登録できる', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api.plans, 'create').mockResolvedValue({} as never);
  inRouter(
    <PlanForm
      questionnaires={questionnaires}
      initial={{
        name: '計画',
        disease: '',
        regimenName: '',
        templateKey: null,
        cycleLengthDays: 21,
        cycleCount: 8,
        baselineDays: 7,
        drugs: [{ name: '薬', route: 'IV', days: [1, 16] }],
        rules: [{ questionnaireId: Q1, dayOffset: 14, windowDays: 3, cycleFrom: 1, cycleTo: null }],
      }}
    />,
  );
  const length = screen.getByLabelText('1 コースの日数');
  await user.clear(length);
  await user.type(length, '14');
  await user.click(screen.getByRole('button', { name: '治療計画を登録する' }));
  expect(await screen.findByText(/1 コースの日数からはみ出している/)).toBeTruthy();
  expect(create).not.toHaveBeenCalled();

  // ボードに、範囲の外に残っていることが出る。ボタンで、範囲に収める(配信は 14 日の中へ動き、16 日目の投与日は消える)
  expect(screen.getByRole('alert').textContent).toContain('投与日 1 件、配信 1 件');
  await user.click(screen.getByRole('button', { name: '範囲に収める' }));
  expect(screen.queryByRole('alert')).toBeNull();
  await user.click(screen.getByRole('button', { name: '治療計画を登録する' }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  expect(create.mock.calls[0]![0]).toMatchObject({
    cycleLengthDays: 14,
    drugs: [{ days: [1] }],
    rules: [{ dayOffset: 13, windowDays: 1 }],
  });
});

test('ボード: 質問票の名前から、その質問票の編集画面へ移れる。保存していない変更があれば確かめる', async () => {
  const user = userEvent.setup();
  const router = createMemoryRouter([
    { path: '/', element: <BoardWithDirty /> },
    { path: '/questionnaires/:id', element: <p>質問票の編集画面</p> },
  ]);
  render(<RouterProvider router={router} />);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await user.click(screen.getByRole('link', { name: '症状チェック' }));
  expect(confirm).toHaveBeenCalled();
  expect(router.state.location.pathname).toBe('/'); // 断ったので移らない

  confirm.mockReturnValue(true);
  await user.click(screen.getByRole('link', { name: '症状チェック' }));
  expect(router.state.location.pathname).toBe(`/questionnaires/${Q1}`);
});

function BoardWithDirty() {
  return (
    <ScheduleBoard
      cycleLengthDays={21}
      cycleCount={8}
      baselineDays={7}
      questionnaires={questionnaires}
      drugs={[]}
      onDrugsChange={() => {}}
      rules={[]}
      onRulesChange={() => {}}
      hasUnsavedChanges
    />
  );
}

test('ボード: ベースラインは既定で付き、バーの印で外せる。外した後に配信を足しても、勝手には戻らない', async () => {
  const user = userEvent.setup();
  const { container } = inRouter(<Board />);
  const dropzone = container.querySelector('.track.dropzone')!;
  dropAt(dropzone, 34 * (7 + 7) + 5);
  expect(rulesNow().map((r) => r.dayOffset)).toEqual([7, -7]);

  // ベースラインのバー(2 つ目)を外す
  await user.click(within(container.querySelector('.bar.baseline')! as HTMLElement).getByRole('button'));
  expect(rulesNow().map((r) => r.dayOffset)).toEqual([7]);
  dropAt(dropzone, 34 * (7 + 14) + 5); // 同じ質問票を 15 日目にも置く
  expect(rulesNow().map((r) => r.dayOffset)).toEqual([7, 14]);

  // 付け直すときは、ベースライン期間に置く
  dropAt(dropzone, 1);
  expect(rulesNow().map((r) => [r.dayOffset, r.windowDays])).toEqual([[7, 3], [14, 3], [-7, 3]]);
});

test('ボード: バーの × で、その配信だけを外せる(ドラッグは始まらない)', async () => {
  const user = userEvent.setup();
  const { container } = inRouter(<Board />);
  dropAt(container.querySelector('.track.dropzone')!, 34 * (7 + 7) + 5);
  expect(rulesNow().map((r) => r.dayOffset)).toEqual([7, -7]);
  // 1 つ目(8 日目)のバーの × を押す。ベースラインの配信は残る
  await user.click(screen.getAllByRole('button', { name: '症状チェック の配信を外す' })[0]!);
  expect(rulesNow().map((r) => r.dayOffset)).toEqual([-7]);
});

test('ボード: 空いたところをドラッグして、配信日から締め切りの日までのバーを描ける', async () => {
  const user = userEvent.setup();
  const { container } = inRouter(<Board />);
  const x = (day: number) => 34 * (7 + day - 1) + 5; // コースの day 日目のマス
  const drag = (track: Element, from: number, to: number) => {
    fireEvent.pointerDown(track, { button: 0, clientX: from, pointerId: 9 });
    fireEvent.pointerMove(track, { clientX: to, pointerId: 9 });
    expect(container.querySelector('.draw-preview')).toBeTruthy(); // 描いている途中の範囲が見える
    fireEvent.pointerUp(track, { clientX: to, pointerId: 9 });
  };
  // 表の末尾の行のリストから、質問票(2 つ目)を追加する。行が増え、ベースラインの配信が付く
  await user.selectOptions(screen.getByLabelText('質問票を追加'), Q2);
  expect(rulesNow()).toEqual([{ questionnaireId: Q2, dayOffset: -7, windowDays: 7, cycleFrom: 1, cycleTo: null }]);
  const row = container.querySelector('.board-row .track.drawable')!;

  // 押しただけでは作らない
  fireEvent.pointerDown(row, { button: 0, clientX: x(8), pointerId: 9 });
  fireEvent.pointerUp(row, { clientX: x(8), pointerId: 9 });
  expect(rulesNow()).toHaveLength(1);

  // その行で、8 日目から 12 日目まで描く
  drag(row, x(8), x(12));
  expect(rulesNow()[1]).toEqual({ questionnaireId: Q2, dayOffset: 7, windowDays: 5, cycleFrom: 1, cycleTo: null });

  // 右から左へ描いてもよい
  drag(row, x(17), x(15));
  expect(rulesNow()[2]).toEqual({ questionnaireId: Q2, dayOffset: 14, windowDays: 3, cycleFrom: 1, cycleTo: null });

  // コースの中で描き始めたら、ベースライン期間へは、はみ出さない
  drag(row, x(2), 0);
  expect(rulesNow()[3]).toMatchObject({ dayOffset: 0, windowDays: 2 });
});

test('ボード: 行のゴミ箱で、質問票ごと(ベースラインも含めて)治療計画から取り消せる', async () => {
  const user = userEvent.setup();
  const { container } = inRouter(<Board />);
  const dropzone = container.querySelector('.track.dropzone')!;
  dropAt(dropzone, 34 * (7 + 7) + 5); // 症状チェック: 8 日目 + ベースライン
  dropAt(dropzone, 34 * (7 + 14) + 5); // 症状チェック: 15 日目
  await user.selectOptions(screen.getByLabelText('質問票を追加'), Q2);
  expect(rulesNow().map((r) => r.questionnaireId)).toEqual([Q1, Q1, Q1, Q2]);

  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await user.click(screen.getByRole('button', { name: '症状チェック を治療計画から取り消す' }));
  expect(confirm.mock.calls[0]![0]).toContain('配信 3 件');
  expect(rulesNow()).toHaveLength(4); // 断ったので、そのまま

  confirm.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: '症状チェック を治療計画から取り消す' }));
  expect(rulesNow().map((r) => r.questionnaireId)).toEqual([Q2]); // ほかの質問票は残る
  expect(screen.queryByRole('button', { name: '症状チェック を治療計画から取り消す' })).toBeNull();
});

test('ボード: 薬剤の表と質問票の表は分かれていて、日の列は同じ幅で並ぶ', () => {
  const { container } = inRouter(<Board />);
  const tables = [...container.querySelectorAll('.board-scroll')];
  expect(tables).toHaveLength(2);
  const [drugTable, ruleTable] = tables as [Element, Element];
  // 薬剤の行は 1 つ目の表、配信を置く行は 2 つ目の表にある
  expect(drugTable.querySelector('.dose')).toBeTruthy();
  expect(drugTable.querySelector('.track.dropzone')).toBeNull();
  expect(ruleTable.querySelector('.dose')).toBeNull();
  expect(ruleTable.querySelector('.track.dropzone')).toBeTruthy();
  // どちらの表にも同じ日の見出しがあり、列の幅と見出しの欄の幅が同じ
  const columns = (table: Element) => [...table.querySelectorAll('.track.head .day')].map((d) => [d.textContent, (d as HTMLElement).style.width]);
  expect(columns(drugTable)).toEqual(columns(ruleTable));
  expect(columns(drugTable)).toHaveLength(28);
  const width = (table: Element) => (table.querySelector('.track') as HTMLElement).style.width;
  expect(width(drugTable)).toBe(width(ruleTable));
});

test('ボード: 質問票は、表の末尾の行のリストから追加する。追加済みのものはリストに出ず、配信をすべて外しても行は残る', async () => {
  const user = userEvent.setup();
  const { container } = inRouter(<Board />);
  const select = () => screen.getByLabelText('質問票を追加') as HTMLSelectElement;
  const options = () => [...select().options].map((o) => o.textContent);
  expect(options()).toEqual(['+ 質問票を追加…', '症状チェック', '簡易チェック']);
  expect(screen.queryByRole('button', { name: /1 日目に置く/ })).toBeNull(); // 左の一覧の + はない

  await user.selectOptions(select(), Q1);
  expect(options()).toEqual(['+ 質問票を追加…', '簡易チェック']);
  // ベースラインの配信を外しても、行は残り、続けて描ける。ベースラインは勝手に戻らない
  await user.click(within(container.querySelector('.bar.baseline')! as HTMLElement).getByRole('button'));
  expect(rulesNow()).toEqual([]);
  const row = container.querySelector('.board-row .track.drawable')!;
  fireEvent.pointerDown(row, { button: 0, clientX: 34 * 8, pointerId: 1 });
  fireEvent.pointerMove(row, { clientX: 34 * 10, pointerId: 1 });
  fireEvent.pointerUp(row, { pointerId: 1 });
  expect(rulesNow().map((r) => r.dayOffset)).toEqual([1]);

  await user.selectOptions(select(), Q2);
  expect(options()).toEqual(['すべて追加済み']);
  expect(select().disabled).toBe(true);
});

test('ボード: 行は、つまみのドラッグ(キーボードでは上下の矢印)で並べ替えられる。薬剤と質問票の表はまたがない', async () => {
  const user = userEvent.setup();
  const { container } = inRouter(<Board />);
  await user.selectOptions(screen.getByLabelText('質問票を追加'), Q1);
  await user.selectOptions(screen.getByLabelText('質問票を追加'), Q2);
  const order = () => rulesNow().map((r) => r.questionnaireId);
  expect(order()).toEqual([Q1, Q2]);

  // 2 行目(簡易チェック)のつまみを、1 行目へドラッグして落とす
  const rowDrag = (handle: Element, target: Element, type: string, from: number) => {
    const dataTransfer = { types: [type], setData: () => {}, getData: (t: string) => (t === type ? String(from) : ''), effectAllowed: '' };
    for (const [create, el] of [[createEvent.dragStart, handle], [createEvent.dragOver, target], [createEvent.drop, target]] as const) {
      const event = create(el);
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      fireEvent(el, event);
    }
  };
  const rows = () => [...container.querySelectorAll('.board-scroll')[1]!.querySelectorAll('.board-row')].slice(1, 3);
  rowDrag(screen.getByLabelText('簡易チェック の行を並べ替える'), rows()[0]!, 'application/x-row-questionnaire', 1);
  expect(order()).toEqual([Q2, Q1]); // 配信の並びも、行の順になる(保存しても順が残る)
  expect(rows().map((r) => r.querySelector('a')!.textContent)).toEqual(['簡易チェック', '症状チェック']);

  // キーボード: 1 行目を下へ
  screen.getByLabelText('簡易チェック の行を並べ替える').focus();
  await user.keyboard('{ArrowDown}');
  expect(order()).toEqual([Q1, Q2]);

  // 質問票の行を、薬剤の表へは落とせない
  const drugRow = container.querySelectorAll('.board-scroll')[0]!.querySelectorAll('.board-row')[1]!;
  rowDrag(screen.getByLabelText('簡易チェック の行を並べ替える'), drugRow, 'application/x-row-questionnaire', 1);
  expect(order()).toEqual([Q1, Q2]);
  expect(JSON.parse(screen.getByTestId('drugs').textContent!)).toHaveLength(1);
});

test('質問票: 質問は、つまみのドラッグで順番を変えられ、ほかの章へも動かせる(上下のボタンはない)', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api.questionnaires, 'create').mockResolvedValue({ id: Q1 } as never);
  const custom = (text: string) => choice(text);
  const { container } = inRouter(
    <QuestionnaireForm
      proCtcae={proCtcae}
      initial={{
        name: '並べ替え',
        description: '',
        templateKey: null,
        sections: [
          { title: '一章', questions: [custom('A'), custom('B'), custom('C')] },
          { title: '二章', questions: [custom('X')] },
        ],
      }}
    />,
  );
  expect(screen.queryByRole('button', { name: '質問を前へ' })).toBeNull();
  expect(screen.queryByRole('button', { name: '質問を後ろへ' })).toBeNull();

  const dragTo = (handle: Element, target: Element) => {
    const dataTransfer = { types: ['application/x-question'], setData: () => {}, getData: () => '', effectAllowed: '' };
    for (const [create, el] of [[createEvent.dragStart, handle], [createEvent.dragOver, target], [createEvent.drop, target], [createEvent.dragEnd, handle]] as const) {
      const event = create(el);
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      fireEvent(el, event);
    }
  };
  const sections = () => [...container.querySelectorAll('section.card')].slice(1); // 1 つ目は名前と説明
  const items = (section: number) => [...sections()[section]!.querySelectorAll('li.question')];
  const handles = (section: number) => within(sections()[section] as HTMLElement).getAllByRole('button', { name: /を並べ替える/ });

  // 一章: C を A の位置へ(先頭へ)
  dragTo(handles(0)[2]!, items(0)[0]!);
  // 一章: 先頭になった C を、キーボードで 1 つ下へ → A, C, B
  handles(0)[0]!.focus();
  await user.keyboard('{ArrowDown}');
  // 一章の B(3 番目)を、二章の X の位置へ → 二章は B, X
  dragTo(handles(0)[2]!, items(1)[0]!);
  // 一章の A(1 番目)を、二章の最後へ → 二章は B, X, A
  dragTo(handles(0)[0]!, sections()[1]!.querySelector('.question-drop-end')!);

  await user.click(screen.getByRole('button', { name: '質問票マスタに登録する' }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  expect(create.mock.calls[0]![0].sections.map((s) => s.questions.map((q) => q.text))).toEqual([['C'], ['B', 'X', 'A']]);
});

test('ボード: 配信のない行は、ほかの質問票に配信を置いても、順が変わらない', async () => {
  const user = userEvent.setup();
  function NoBaseline() {
    const [rules, setRules] = useState<DeliveryRule[]>([]);
    return (
      <ScheduleBoard cycleLengthDays={21} cycleCount={8} baselineDays={0} questionnaires={questionnaires} drugs={[]} onDrugsChange={() => {}} rules={rules} onRulesChange={setRules} />
    );
  }
  const { container } = inRouter(<NoBaseline />);
  // ベースラインがないので、追加しただけの行には配信がない
  await user.selectOptions(screen.getByLabelText('質問票を追加'), Q1);
  await user.selectOptions(screen.getByLabelText('質問票を追加'), Q2);
  const names = () => [...container.querySelectorAll('.board-scroll')[1]!.querySelectorAll('.board-row a')].map((a) => a.textContent);
  expect(names()).toEqual(['症状チェック', '簡易チェック']);
  // 2 行目にだけ配信を描く
  const row = container.querySelectorAll('.board-row .track.drawable')[1]!;
  fireEvent.pointerDown(row, { button: 0, clientX: 34 * 2, pointerId: 1 });
  fireEvent.pointerMove(row, { clientX: 34 * 4, pointerId: 1 });
  fireEvent.pointerUp(row, { pointerId: 1 });
  expect(names()).toEqual(['症状チェック', '簡易チェック']);
});

test('質問票: 回答の形式を選択式でなくすと、選択肢は送られない。同じ選択肢が重なると登録できない', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api.questionnaires, 'create').mockResolvedValue({ id: Q1 } as never);
  inRouter(
    <QuestionnaireForm
      proCtcae={proCtcae}
      initial={{ name: '形式', description: '', templateKey: null, sections: [{ title: '章', questions: [choice('A'), choice('B')] }] }}
    />,
  );
  const types = screen.getAllByLabelText('回答の形式');
  await user.selectOptions(types[0]!, 'NUMBER');
  // 2 問目は、選択肢を重ねる
  const options = screen.getByText('選択肢(1 行に 1 つ)').closest('label')!.querySelector('textarea')!;
  await user.clear(options);
  await user.type(options, 'はい{Enter}はい');
  await user.click(screen.getByRole('button', { name: '質問票マスタに登録する' }));
  expect(await screen.findByText('同じ選択肢が重なっている')).toBeTruthy();
  expect(create).not.toHaveBeenCalled();

  await user.type(options, '{Backspace}{Backspace}いいえ');
  await user.click(screen.getByRole('button', { name: '質問票マスタに登録する' }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  expect(create.mock.calls[0]![0].sections[0]!.questions.map((q) => [q.answerType, q.options])).toEqual([
    ['NUMBER', []],
    ['SINGLE_CHOICE', ['はい', 'いいえ']],
  ]);
});
