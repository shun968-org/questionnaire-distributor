import { expect, test, vi } from 'vitest';
import { createApp } from './app.ts';
import { catalogSchema, type ProCtcaeSymptom } from './schemas/domain/catalog.ts';
import { createCatalogService } from './services/catalog.ts';
import { createSeedService } from './services/seed.ts';
import { regimenTemplates } from './services/catalog/regimen-templates.ts';
import { createMemoryUnitOfWork } from './testing/memory-uow.ts';

// 文言はリポジトリに持たないので、テンプレートが使う症状を、作った文でマスタに入れる
const symptom = (code: string, no: number): ProCtcaeSymptom => ({
  code,
  no,
  term: code,
  label: `症状 ${no}`,
  note: null,
  category: '分類',
  items: ['FREQUENCY', 'SEVERITY'].map((attribute) => ({
    source: 'PRO_CTCAE',
    proCtcaeCode: `${code}:${attribute}`,
    text: `症状 ${no} の ${attribute} は？`,
    answerType: 'SINGLE_CHOICE',
    options: ['なし', 'あり'],
    required: true,
  })),
});
const TEMPLATE_SYMPTOMS = [
  ...regimenTemplates.flatMap((t) => t.questionnaire.sections.flatMap((s) => s.proCtcaeSymptoms)),
  // 質問票のサンプルが使う症状
  'GENERAL_PAIN',
  'INSOMNIA',
  'ANXIOUS',
];

const setup = async ({ master = true } = {}) => {
  const uow = createMemoryUnitOfWork();
  if (master) await createCatalogService(uow).replaceProCtcae({ requestId: 'test' }, TEMPLATE_SYMPTOMS.map((code, i) => symptom(code, i + 1)));
  const { app } = createApp({ uow, today: () => '2026-01-18' });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  return { call, uow };
};

test('テンプレートは、質問票と治療計画のスキーマを満たす', async () => {
  const { call } = await setup();
  const res = await call('GET', '/catalog');
  expect(res.status).toBe(200);
  const catalog = catalogSchema.parse(res.body);
  expect(catalog.regimenTemplates[0]?.plan.cycleLengthDays).toBe(21);
  expect(catalog.proCtcae).toHaveLength(TEMPLATE_SYMPTOMS.length);
});

test('テンプレートから質問票と治療計画を作り、グループの患者ごとに配信の予定を出し、中断で停止する', async () => {
  const { call } = await setup();
  const template = (await call('GET', '/catalog')).body.regimenTemplates[0];

  const questionnaire = (await call('POST', '/questionnaires', { ...template.questionnaire, name: '編集した質問票' })).body;
  expect(questionnaire.sections).toHaveLength(3);
  // PRO-CTCAE の質問には、マスタの文言が入る
  expect(questionnaire.sections[0].questions[0]).toMatchObject({ proCtcaeCode: 'NAUSEA:FREQUENCY', text: '症状 1 の FREQUENCY は？' });
  // PRO-CTCAE の質問の文言を変えると、登録できない
  const edited = structuredClone(template.questionnaire);
  edited.sections[0].questions[0].text = '吐き気はどうでしたか';
  expect((await call('POST', '/questionnaires', edited)).status).toBe(422);

  const rules = [
    { questionnaireId: questionnaire.id, dayOffset: -7, windowDays: 7, cycleFrom: 1, cycleTo: null },
    { questionnaireId: questionnaire.id, dayOffset: 7, windowDays: 3, cycleFrom: 1, cycleTo: null },
  ];
  const plan = await call('POST', '/plans', { ...template.plan, cycleCount: 2, rules });
  expect(plan.status).toBe(201);

  // 質問票の一覧に、配信で使っている治療計画が出る(配信が 2 件あっても 1 回だけ)
  expect((await call('GET', '/questionnaires')).body[0].usedByPlans).toEqual([{ id: plan.body.id, name: plan.body.name }]);
  // 配信スケジュールで使っている質問票は削除できない
  expect((await call('DELETE', `/questionnaires/${questionnaire.id}`)).status).toBe(409);
  // 回答可能期間がコースをはみ出す計画は登録できない
  const bad = [{ ...rules[1], dayOffset: 20, windowDays: 3 }];
  expect((await call('POST', '/plans', { ...template.plan, rules: bad })).status).toBe(400);

  const group = (await call('POST', '/groups', { name: 'A 病棟', planId: plan.body.id })).body;
  expect((await call('POST', `/groups/${group.id}/patients`, { count: 2 })).status).toBe(201);
  let detail = (await call('GET', `/groups/${group.id}`)).body;
  const [p1, p2] = detail.group.patients;
  expect(p1.code).toMatch(/^P-[A-Z2-9]{8}$/);

  // 開始日は患者ごとに違う
  await call('PUT', `/patients/${p1.id}/start-date`, { startDate: '2026-01-10' });
  await call('PUT', `/patients/${p2.id}/start-date`, { startDate: '2026-01-20' });

  // 確定した後は、患者を追加できない
  expect((await call('POST', `/groups/${group.id}/confirm`)).status).toBe(200);
  expect((await call('POST', `/groups/${group.id}/patients`, { count: 1 })).status).toBe(409);

  // 患者単位で中断する
  expect((await call('POST', `/patients/${p1.id}/suspension`, { suspendedOn: '2026-01-18', reason: '副作用' })).status).toBe(200);
  detail = (await call('GET', `/groups/${group.id}`)).body;
  const statuses = (id: string) =>
    detail.schedules.find((s: any) => s.patientId === id).deliveries.map((d: any) => `${d.opensOn}:${d.status}`);
  expect(statuses(p1.id)).toEqual(['2026-01-03:CLOSED', '2026-01-17:OPEN', '2026-02-07:STOPPED']);
  expect(statuses(p2.id)).toEqual(['2026-01-13:OPEN', '2026-01-27:SCHEDULED', '2026-02-17:SCHEDULED']);

  // 中断を取り消すと、もとの予定に戻る
  await call('DELETE', `/patients/${p1.id}/suspension`);
  detail = (await call('GET', `/groups/${group.id}`)).body;
  expect(statuses(p1.id)[2]).toBe('2026-02-07:SCHEDULED');
});

test('PRO-CTCAE マスタが空なら、サーバのエラーにする', async () => {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { call } = await setup({ master: false });
  expect((await call('GET', '/catalog')).status).toBe(500);
  const body = { name: 'x', description: '', templateKey: null, sections: [{ title: '章', questions: [symptom('NAUSEA', 1).items[0]] }] };
  expect((await call('POST', '/questionnaires', body)).status).toBe(500);
  expect(String(errorLog.mock.calls[0]?.[0])).toContain('PRO-CTCAE マスタが空');
  errorLog.mockRestore();
});

test('マスタにない PRO-CTCAE の質問は登録できない', async () => {
  const { call } = await setup();
  const body = { name: 'x', description: '', templateKey: null, sections: [{ title: '章', questions: [symptom('UNKNOWN', 99).items[0]] }] };
  expect((await call('POST', '/questionnaires', body)).status).toBe(422);
});

test('seed: 治療計画のサンプルと、その配信で使う質問票を登録する。2 回実行しても増えない', async () => {
  const { call, uow } = await setup();
  const seed = createSeedService(uow);
  expect(await seed.seedSamples({ requestId: 'test' })).toEqual(['【サンプル】CapeOX±ベバシズマブ療法', 'PRO-CTCAE（B set）']);
  expect(await seed.seedSamples({ requestId: 'test' })).toEqual([]);

  const plans = (await call('GET', '/plans')).body;
  expect(plans).toHaveLength(1);
  expect(plans[0]).toMatchObject({ name: '【サンプル】CapeOX±ベバシズマブ療法', cycleLengthDays: 21, ruleCount: 3 });
  const questionnaires = (await call('GET', '/questionnaires')).body;
  expect(questionnaires.map((q: any) => [q.name, q.sectionCount]).sort()).toEqual([
    ['PRO-CTCAE（A set）', 3],
    ['PRO-CTCAE（B set）', 2],
  ]);

  // サンプルは、API の検証を通る内容になっている(そのまま保存し直せる)
  const plan = (await call('GET', `/plans/${plans[0].id}`)).body;
  const { id, updatedAt, ...input } = plan;
  expect((await call('PUT', `/plans/${id}`, input)).status).toBe(200);
  const { id: qid, updatedAt: _, ...qInput } = (await call('GET', `/questionnaires/${questionnaires[0].id}`)).body;
  expect((await call('PUT', `/questionnaires/${qid}`, qInput)).status).toBe(200);
  expect(questionnaires.every((q: any) => q.questionCount > 0)).toBe(true);
});

test('PRO-CTCAE マスタの取り込みは、マスタで保てない形の質問を受け付けない', async () => {
  const service = createCatalogService(createMemoryUnitOfWork());
  const ctx = { requestId: 'test' };
  const base = symptom('NAUSEA', 1);
  const withItem = (patch: object) => [{ ...base, items: [{ ...base.items[0]!, ...patch }] }];
  await expect(service.replaceProCtcae(ctx, [])).rejects.toThrow('正しくない');
  await expect(service.replaceProCtcae(ctx, [base, base])).rejects.toThrow('重なっている');
  await expect(service.replaceProCtcae(ctx, withItem({ source: 'CUSTOM', proCtcaeCode: null }))).rejects.toThrow('形が正しくない');
  await expect(service.replaceProCtcae(ctx, withItem({ answerType: 'TEXT' }))).rejects.toThrow('形が正しくない');
  await expect(service.replaceProCtcae(ctx, withItem({ required: false }))).rejects.toThrow('形が正しくない');
  await expect(service.replaceProCtcae(ctx, [base])).resolves.toBeUndefined();
});
