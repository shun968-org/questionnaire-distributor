import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { type Control, Controller, type UseFormRegister, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { api, type ProCtcaeSymptom, type QuestionnaireInput } from '../api/client.ts';
import { type QuestionnaireFormValues, questionnaireFormSchema } from '../schemas/questionnaire.ts';
import { Icon } from './icons.tsx';
import { Field, FieldError, useSubmit, useUnsavedChangesGuard } from './shared.tsx';

type Props = {
  /** 編集する質問票の ID。新規のときは undefined */
  id?: string;
  initial: QuestionnaireInput;
  proCtcae: ProCtcaeSymptom[];
};

const ANSWER_TYPES = [
  ['SINGLE_CHOICE', '1 つ選ぶ'],
  ['MULTI_CHOICE', '複数選ぶ'],
  ['NUMBER', '数値'],
  ['TEXT', '自由記述'],
] as const;

const symptomOf = (code: string | null) => code?.split(':')[0] ?? null;

export function QuestionnaireForm({ id, initial, proCtcae }: Props) {
  const navigate = useNavigate();
  const { submit, error: submitError } = useSubmit({ revalidate: false });
  const { register, control, handleSubmit, getValues, setValue, formState } = useForm<QuestionnaireFormValues>({
    resolver: zodResolver(questionnaireFormSchema),
    defaultValues: initial,
  });
  const sections = useFieldArray({ control, name: 'sections' });
  const { errors, isSubmitting } = formState;
  const allowLeave = useUnsavedChangesGuard(formState.isDirty);

  const onSubmit = handleSubmit(async (values) => {
    // 保存したら、その質問票のプレビューへ戻る
    let savedId = '';
    const ok = await submit(async () => {
      savedId = (id ? await api.questionnaires.update(id, values) : await api.questionnaires.create(values)).id;
    });
    if (ok) {
      allowLeave();
      navigate(`/questionnaires/${savedId}`);
    }
  });

  /** 質問を別の章へ移す。toIndex を省くと、章の最後に入れる */
  const moveQuestion = (from: number, index: number, to: number, toIndex?: number) => {
    const all = getValues('sections');
    const question = all[from]?.questions[index];
    if (!question || !all[to]) return;
    const target = [...all[to]!.questions];
    target.splice(toIndex ?? target.length, 0, question);
    setValue(`sections.${from}.questions`, all[from]!.questions.filter((_, i) => i !== index), { shouldDirty: true });
    setValue(`sections.${to}.questions`, target, { shouldDirty: true });
  };

  return (
    <form onSubmit={onSubmit} className="stack">
      <section className="card stack">
        <Field label="質問票の名前" error={errors.name?.message}>
          <input {...register('name')} />
        </Field>
        <Field label="説明" error={errors.description?.message}>
          <textarea rows={2} {...register('description')} />
        </Field>
      </section>

      <p className="hint">
        1 つの章が、回答画面の 1 ページになる。章の順番がページの順番になる。質問は、左のつまみをドラッグして順番を変える(ほかの章へも動かせる)。
      </p>
      {sections.fields.map((section, i) => (
        <SectionEditor
          key={section.id}
          index={i}
          count={sections.fields.length}
          control={control}
          register={register}
          proCtcae={proCtcae}
          titleError={errors.sections?.[i]?.title?.message}
          questionsError={errors.sections?.[i]?.questions?.message ?? errors.sections?.[i]?.questions?.root?.message}
          questionErrors={(j) => errors.sections?.[i]?.questions?.[j]}
          onMove={(to) => sections.move(i, to)}
          onRemove={() => sections.remove(i)}
          onMoveQuestion={(index, to) => moveQuestion(i, index, to)}
          onClearOptions={(j) => setValue(`sections.${i}.questions.${j}.options`, [], { shouldDirty: true })}
          onMoveQuestionFrom={(from, fromIndex, toIndex) => moveQuestion(from, fromIndex, i, toIndex)}
        />
      ))}
      <FieldError message={errors.sections?.message ?? errors.sections?.root?.message} />
      <div>
        <button type="button" onClick={() => sections.append({ title: `第 ${sections.fields.length + 1} 章`, questions: [] })}>
          + 章(ページ)を追加
        </button>
      </div>

      <div className="actions">
        <FieldError message={submitError} />
        <button type="button" onClick={() => navigate(id ? `/questionnaires/${id}` : '/questionnaires')}>
          キャンセル
        </button>
        <button type="submit" className="primary" disabled={isSubmitting}>
          {id ? '保存する' : '質問票マスタに登録する'}
        </button>
      </div>
    </form>
  );
}

type SectionProps = {
  index: number;
  count: number;
  control: Control<QuestionnaireFormValues>;
  register: UseFormRegister<QuestionnaireFormValues>;
  proCtcae: ProCtcaeSymptom[];
  titleError?: string;
  questionsError?: string;
  questionErrors: (j: number) => { text?: { message?: string }; options?: { message?: string } } | undefined;
  onMove: (to: number) => void;
  onRemove: () => void;
  onMoveQuestion: (index: number, toSection: number) => void;
  onClearOptions: (questionIndex: number) => void;
  /** ほかの章の質問を、この章の toIndex 番目(省くと最後)へ移す */
  onMoveQuestionFrom: (fromSection: number, fromIndex: number, toIndex?: number) => void;
};

// 質問の並べ替えのドラッグ。つかんでいる質問(章をまたいで動かせるよう、章の外に持つ)
const QUESTION_DRAG_TYPE = 'application/x-question';
let draggingQuestion: { section: number; index: number } | null = null;

function SectionEditor(props: SectionProps) {
  const { index, count, control, register, proCtcae } = props;
  const name = `sections.${index}.questions` as const;
  const questions = useFieldArray({ control, name });
  const allSections = useWatch({ control, name: 'sections' });
  const [pickerOpen, setPickerOpen] = useState(false);
  // 落とす先。質問の番号(その質問の位置に入る)。章の最後は questions.fields.length
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const dropProps = (toIndex: number) => ({
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes(QUESTION_DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      if (dropIndex !== toIndex) setDropIndex(toIndex);
    },
    onDragLeave: () => setDropIndex(null),
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      const from = draggingQuestion;
      setDropIndex(null);
      if (!from || !e.dataTransfer.types.includes(QUESTION_DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      draggingQuestion = null;
      if (from.section === index) {
        // 同じ章の中: 落とした質問の位置へ動かす
        const to = Math.min(toIndex, questions.fields.length - 1);
        if (to !== from.index) questions.move(from.index, to);
      } else {
        props.onMoveQuestionFrom(from.section, from.index, toIndex);
      }
    },
  });

  // 質問票のどこかですでに使っている症状
  const usedSymptoms = new Set(
    allSections.flatMap((s) => s.questions.map((q) => symptomOf(q.proCtcaeCode))).filter((c) => c !== null),
  );

  return (
    <section className="card stack">
      <div className="row">
        <span className="badge">
          第 {index + 1} 章 / {index + 1} ページ目
        </span>
        <input className="grow" aria-label="章のタイトル" {...register(`sections.${index}.title`)} />
        <button type="button" className="icon-button" disabled={index === 0} onClick={() => props.onMove(index - 1)} aria-label="章を前へ" title="章を前へ">
          <Icon name="up" />
        </button>
        <button type="button" className="icon-button" disabled={index === count - 1} onClick={() => props.onMove(index + 1)} aria-label="章を後ろへ" title="章を後ろへ">
          <Icon name="down" />
        </button>
        <button type="button" className="icon-button danger" disabled={count === 1} onClick={props.onRemove} aria-label="章を削除" title="章を削除(章の中の質問も消える)">
          <Icon name="trash" />
        </button>
      </div>
      <FieldError message={props.titleError} />

      <ol className="questions">
        {questions.fields.map((q, j) => {
          const current = allSections[index]?.questions[j];
          const isChoice = current?.answerType === 'SINGLE_CHOICE' || current?.answerType === 'MULTI_CHOICE';
          const err = props.questionErrors(j);
          return (
            <li
              key={q.id}
              className={`question${dropIndex === j ? (draggingQuestion?.section === index && draggingQuestion.index < j ? ' drop-after' : ' drop-before') : ''}`}
              {...dropProps(j)}
            >
              <div className="row">
                <span
                  className="row-handle"
                  role="button"
                  tabIndex={0}
                  draggable
                  aria-label={`質問 ${j + 1} を並べ替える`}
                  title="ドラッグして質問の順番を変える。ほかの章へも動かせる(キーボードでは上下の矢印)"
                  onDragStart={(e) => {
                    e.dataTransfer.setData(QUESTION_DRAG_TYPE, `${index}:${j}`);
                    e.dataTransfer.effectAllowed = 'move';
                    draggingQuestion = { section: index, index: j };
                  }}
                  onDragEnd={() => {
                    draggingQuestion = null;
                    setDropIndex(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    const to = j + (e.key === 'ArrowUp' ? -1 : 1);
                    if (to >= 0 && to < questions.fields.length) questions.move(j, to);
                  }}
                >
                  <Icon name="grip" />
                </span>
                <span className={current?.source === 'PRO_CTCAE' ? 'badge pro' : 'badge'}>
                  {current?.source === 'PRO_CTCAE' ? 'PRO-CTCAE' : '任意の質問'}
                </span>
                <span className="grow" />
                {count > 1 && (
                  <select
                    aria-label="章を移動"
                    value=""
                    onChange={(e) => e.target.value !== '' && props.onMoveQuestion(j, Number(e.target.value))}
                  >
                    <option value="">章を移動…</option>
                    {allSections.map((s, k) =>
                      k === index ? null : (
                        <option key={k} value={k}>
                          第 {k + 1} 章 {s.title}
                        </option>
                      ),
                    )}
                  </select>
                )}
                <button type="button" className="icon-button danger" onClick={() => questions.remove(j)} aria-label="質問を削除" title="質問を削除">
                  <Icon name="trash" />
                </button>
              </div>
              {current?.source === 'PRO_CTCAE' ? (
                // PRO-CTCAE の質問は、資料の文言のまま使う(編集できない)
                <>
                  <p className="official-text">{current.text}</p>
                  <p className="hint">選択肢: {current.options.join(' / ')}</p>
                  <label className="inline">
                    <input type="checkbox" {...register(`${name}.${j}.required`)} />
                    必須
                  </label>
                </>
              ) : (
                <>
                  <textarea rows={2} aria-label="質問文" {...register(`${name}.${j}.text`)} />
                  <FieldError message={err?.text?.message} />
                  <div className="row top">
                    <label className="inline">
                      回答の形式
                      <select
                        {...register(`${name}.${j}.answerType`, {
                          // 選択式でなくしたら、選択肢を消す(隠れた選択肢が、検証・送信されないように)
                          onChange: (e) => {
                            if (e.target.value === 'NUMBER' || e.target.value === 'TEXT') props.onClearOptions(j);
                          },
                        })}
                      >
                        {ANSWER_TYPES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline">
                      <input type="checkbox" {...register(`${name}.${j}.required`)} />
                      必須
                    </label>
                    {isChoice && (
                      <label className="grow">
                        <span className="hint">選択肢(1 行に 1 つ)</span>
                        <Controller
                          control={control}
                          name={`${name}.${j}.options`}
                          render={({ field }) => <OptionsInput value={field.value} onChange={field.onChange} />}
                          // 選択式でなくして戻したら、入力欄を作り直す
                          key={String(isChoice)}
                        />
                        <FieldError message={err?.options?.message} />
                      </label>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {/* 章の最後へ落とす場所。質問のない章へ動かすときにも使う */}
      <div className={`question-drop-end${dropIndex === questions.fields.length ? ' over' : ''}`} {...dropProps(questions.fields.length)} />
      <FieldError message={props.questionsError} />

      <div className="row">
        <button type="button" onClick={() => setPickerOpen((v) => !v)}>
          + PRO-CTCAE の症状から追加
        </button>
        <button
          type="button"
          onClick={() =>
            questions.append({
              source: 'CUSTOM',
              proCtcaeCode: null,
              text: '',
              answerType: 'SINGLE_CHOICE',
              options: ['はい', 'いいえ'],
              required: true,
            })
          }
        >
          + 任意の質問を追加
        </button>
      </div>
      {pickerOpen && (
        <SymptomPicker
          proCtcae={proCtcae}
          used={usedSymptoms}
          onAdd={(symptoms) => {
            questions.append(symptoms.flatMap((s) => s.items));
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}

/**
 * 選択肢の入力欄。値は、フォームの状態(選択肢の配列)だけで持つ。
 * 入力の途中の空行や行末の空白は、欄(DOM)が持つ。フォームの状態には、空行を除いた選択肢を入れる
 */
function OptionsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <textarea
      rows={Math.max(3, value.length + 1)}
      defaultValue={value.join('\n')}
      onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
    />
  );
}

function SymptomPicker(props: {
  proCtcae: ProCtcaeSymptom[];
  used: Set<string>;
  onAdd: (symptoms: ProCtcaeSymptom[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const categories = [...new Set(props.proCtcae.map((s) => s.category))];
  const toggle = (code: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(code)) next.add(code);
      return next;
    });

  return (
    <div className="picker stack">
      <p className="hint">出す症状を選ぶ。症状ごとに、頻度・程度・生活への支障などの質問がまとめて入る(追加した後に個別に削除できる)。質問文と選択肢は PRO-CTCAE マスタ(日本語版)のままで、編集できない。</p>
      {categories.map((category) => (
        <fieldset key={category}>
          <legend>{category}</legend>
          <div className="chips">
            {props.proCtcae
              .filter((s) => s.category === category)
              .map((s) => (
                <label key={s.code} title={s.note ?? undefined} className={props.used.has(s.code) ? 'chip used' : 'chip'}>
                  <input type="checkbox" checked={picked.has(s.code)} onChange={() => toggle(s.code)} />
                  {s.label}
                  <small>
                    {s.items.length} 問{props.used.has(s.code) ? '・追加済み' : ''}
                  </small>
                </label>
              ))}
          </div>
        </fieldset>
      ))}
      <div className="actions">
        <button type="button" onClick={props.onClose}>
          閉じる
        </button>
        <button
          type="button"
          className="primary"
          disabled={picked.size === 0}
          onClick={() => props.onAdd(props.proCtcae.filter((s) => picked.has(s.code)))}
        >
          選んだ {picked.size} 症状をこの章に追加
        </button>
      </div>
    </div>
  );
}
