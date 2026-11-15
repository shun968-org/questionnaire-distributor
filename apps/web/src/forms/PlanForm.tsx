import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { api, type PlanInput, type QuestionnaireSummary } from '../api/client.ts';
import { type PlanFormValues, planFormSchema } from '../schemas/plan.ts';
import { ScheduleBoard } from './ScheduleBoard.tsx';
import { Field, FieldError, useSubmit } from './shared.tsx';

type Props = {
  id?: string;
  initial: PlanInput;
  questionnaires: QuestionnaireSummary[];
};

export function PlanForm({ id, initial, questionnaires }: Props) {
  const navigate = useNavigate();
  const { submit, error: submitError } = useSubmit({ revalidate: false });
  const { register, control, handleSubmit, setValue, formState } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: initial,
  });
  const { errors, isSubmitting } = formState;
  const values = useWatch({ control });

  const onSubmit = handleSubmit(async (input) => {
    if (await submit(() => (id ? api.plans.update(id, input) : api.plans.create(input)))) navigate('/plans');
  });

  // 薬剤のエラー: 行ごとのもの(名前・投与日)と、配列そのもののもの(行の数の上限)
  const drugErrors = [
    errors.drugs?.message,
    errors.drugs?.root?.message,
    ...(Array.isArray(errors.drugs) ? errors.drugs.flatMap((d) => [d?.name?.message, d?.days?.message]) : []),
  ].filter((m): m is string => !!m);

  return (
    <form onSubmit={onSubmit} className="stack">
      <section className="card grid-form">
        <Field label="治療計画の名前" error={errors.name?.message}>
          <input {...register('name')} />
        </Field>
        <Field label="疾患" error={errors.disease?.message}>
          <input {...register('disease')} />
        </Field>
        <Field label="薬剤セット(レジメン)" error={errors.regimenName?.message}>
          <input {...register('regimenName')} />
        </Field>
        <Field label="1 コースの日数" error={errors.cycleLengthDays?.message}>
          <input type="number" min={1} {...register('cycleLengthDays', { valueAsNumber: true })} />
        </Field>
        <Field label="コース数" error={errors.cycleCount?.message}>
          <input type="number" min={1} {...register('cycleCount', { valueAsNumber: true })} />
        </Field>
        <Field
          label="ベースラインの日数"
          error={errors.baselineDays?.message}
          hint="治療開始前に質問できる期間。0 なら使わない"
        >
          <input type="number" min={0} {...register('baselineDays', { valueAsNumber: true })} />
        </Field>
      </section>

      <section className="card stack">
        <h3>配信スケジュール</h3>
        <p className="hint">
          1 コース分の配置が、対象のコースで繰り返される。実際の配信日は、患者ごとの治療開始日から計算する。
        </p>
        <ScheduleBoard
          cycleLengthDays={values.cycleLengthDays ?? 1}
          cycleCount={values.cycleCount ?? 1}
          baselineDays={values.baselineDays ?? 0}
          questionnaires={questionnaires}
          hasUnsavedChanges={formState.isDirty}
          drugs={(values.drugs ?? []) as PlanFormValues['drugs']}
          onDrugsChange={(drugs) => setValue('drugs', drugs, { shouldDirty: true, shouldValidate: formState.isSubmitted })}
          rules={(values.rules ?? []) as PlanFormValues['rules']}
          onRulesChange={(rules) => setValue('rules', rules, { shouldDirty: true, shouldValidate: formState.isSubmitted })}
        />
        <FieldError message={errors.rules?.message ?? errors.rules?.root?.message} />
        {drugErrors.map((m) => (
          <FieldError key={m} message={m} />
        ))}
      </section>

      <div className="actions">
        <FieldError message={submitError} />
        <button type="button" onClick={() => navigate('/plans')}>
          キャンセル
        </button>
        <button type="submit" className="primary" disabled={isSubmitting}>
          {id ? '保存する' : '治療計画を登録する'}
        </button>
      </div>
    </form>
  );
}
