import { ValidationError } from '../errors/index.ts';
import type { Catalog, ProCtcaeSymptom, RegimenTemplate } from '../schemas/domain/catalog.ts';
import { type RegimenTemplateDefinition, regimenTemplates } from './catalog/regimen-templates.ts';
import type { ProCtcaeRepository, Repositories, RequestContext, UnitOfWork } from './ports/index.ts';

/**
 * PRO-CTCAE マスタを読む。空なら、サーバのエラーにする(業務エラーではないので、HTTP では 500 になる)。
 * マスタは運用の前に取り込んでおくもので、空のまま画面を使わせない。
 */
export async function loadProCtcaeMaster(proCtcae: ProCtcaeRepository): Promise<ProCtcaeSymptom[]> {
  const symptoms = await proCtcae.list();
  if (symptoms.length === 0) throw new Error('PRO-CTCAE マスタが空。db:import-pro-ctcae で取り込む');
  return symptoms;
}

/** テンプレートの質問票に、PRO-CTCAE マスタの文言を入れる。マスタにない症状があれば、サーバのエラーにする */
export function resolveTemplate(definition: RegimenTemplateDefinition, symptoms: Map<string, ProCtcaeSymptom>): RegimenTemplate {
  const itemsOf = (code: string) => {
    const symptom = symptoms.get(code);
    if (!symptom) throw new Error(`テンプレート ${definition.key} が使う症状 ${code} が、PRO-CTCAE マスタにない`);
    return symptom.items;
  };
  const sections = definition.questionnaire.sections.map((s) => ({
    title: s.title,
    questions: [...s.proCtcaeSymptoms.flatMap(itemsOf), ...s.customQuestions],
  }));
  return {
    key: definition.key,
    name: definition.name,
    disease: definition.disease,
    source: definition.source,
    questionnaire: {
      name: definition.questionnaire.name,
      description: definition.questionnaire.description,
      templateKey: definition.key,
      sections,
    },
    plan: definition.plan,
  };
}

export function createCatalogService(uow: UnitOfWork<Pick<Repositories, 'proCtcae'>>) {
  return {
    get: (ctx: RequestContext): Promise<Catalog> =>
      uow.run(ctx, async ({ proCtcae }) => {
        const symptoms = await loadProCtcaeMaster(proCtcae);
        const byCode = new Map(symptoms.map((s) => [s.code, s]));
        return { proCtcae: symptoms, regimenTemplates: regimenTemplates.map((t) => resolveTemplate(t, byCode)) };
      }),

    /** PRO-CTCAE マスタを、取り込んだ内容で置き換える。登録済みの質問票は、登録したときの文言のまま変わらない */
    replaceProCtcae: (ctx: RequestContext, symptoms: ProCtcaeSymptom[]) => {
      const codes = symptoms.flatMap((s) => s.items.map((i) => i.proCtcaeCode));
      if (symptoms.length === 0 || new Set(codes).size !== codes.length || new Set(symptoms.map((s) => s.code)).size !== symptoms.length) {
        throw new ValidationError('PRO-CTCAE の取り込みの内容が正しくない(空、またはコードが重なっている)');
      }
      return uow.run(ctx, ({ proCtcae }) => proCtcae.replaceAll(symptoms));
    },
  };
}
export type CatalogService = ReturnType<typeof createCatalogService>;
