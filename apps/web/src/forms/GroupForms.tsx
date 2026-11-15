import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { api, type Patient, type PlanSummary } from '../api/client.ts';
import {
  type AddPatientsFormValues,
  addPatientsFormSchema,
  type GroupFormValues,
  groupFormSchema,
  type StartDateFormValues,
  type SuspendFormValues,
  startDateFormSchema,
  suspendFormSchema,
} from '../schemas/group.ts';
import { Icon } from './icons.tsx';
import { Field, FieldError, useSubmit } from './shared.tsx';

type GroupFormProps = {
  id?: string;
  initial: { name: string; planId: string | null };
  plans: PlanSummary[];
  /** 患者を確定した後は、治療計画を変えられない */
  planLocked?: boolean;
};

export function GroupForm({ id, initial, plans, planLocked }: GroupFormProps) {
  const navigate = useNavigate();
  const { submit, error } = useSubmit();
  const { register, handleSubmit, formState } = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: { name: initial.name, planId: initial.planId ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    const input = { name: values.name, planId: values.planId || null };
    if (id) {
      await submit(() => api.groups.update(id, input));
      return;
    }
    let createdId = '';
    const ok = await submit(async () => {
      createdId = (await api.groups.create(input)).id;
    });
    if (ok) navigate(`/groups/${createdId}`);
  });

  return (
    <form onSubmit={onSubmit} className="row top wrap">
      <Field label="グループの名前" error={formState.errors.name?.message}>
        <input {...register('name')} />
      </Field>
      <Field label="適用する治療計画" hint={planLocked ? '患者を確定したので変更できない' : undefined}>
        <select {...register('planId')} disabled={planLocked}>
          <option value="">(未選択)</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}({p.cycleLengthDays} 日 × {p.cycleCount} コース)
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className="primary align-end" disabled={formState.isSubmitting}>
        {id ? '保存する' : 'グループを作る'}
      </button>
      <FieldError message={error} />
    </form>
  );
}

export function AddPatientsForm({ groupId }: { groupId: string }) {
  const { submit, error } = useSubmit();
  const { register, handleSubmit, formState } = useForm<AddPatientsFormValues>({
    resolver: zodResolver(addPatientsFormSchema),
    defaultValues: { count: 1 },
  });
  return (
    <form onSubmit={handleSubmit((v) => submit(() => api.groups.addPatients(groupId, v.count)))} className="row wrap">
      <label className="inline">
        患者 ID を
        <input type="number" min={1} className="narrow" {...register('count', { valueAsNumber: true })} />
        人分
      </label>
      <button type="submit" disabled={formState.isSubmitting}>
        発行して割り当てる
      </button>
      <FieldError message={formState.errors.count?.message ?? error} />
    </form>
  );
}

export function ConfirmGroupForm({ groupId, disabledReason }: { groupId: string; disabledReason?: string }) {
  const { submit, error } = useSubmit();
  const { handleSubmit, formState } = useForm();
  const onSubmit = handleSubmit(async () => {
    if (!window.confirm('グループの患者を確定する。確定した後は、患者を追加できない。よいか?')) return;
    await submit(() => api.groups.confirm(groupId));
  });
  return (
    <form onSubmit={onSubmit} className="row wrap">
      <button type="submit" className="primary" disabled={!!disabledReason || formState.isSubmitting}>
        患者を確定する
      </button>
      <span className="hint">{disabledReason ?? '確定した後は、患者を追加できない。'}</span>
      <FieldError message={error} />
    </form>
  );
}

export function StartDateForm({ patient }: { patient: Patient }) {
  const { submit, error } = useSubmit();
  const { register, handleSubmit, formState } = useForm<StartDateFormValues>({
    resolver: zodResolver(startDateFormSchema),
    defaultValues: { startDate: patient.startDate ?? '' },
  });
  return (
    <form onSubmit={handleSubmit((v) => submit(() => api.patients.setStartDate(patient.id, v.startDate || null)))} className="row">
      <input type="date" aria-label={`${patient.code} の治療開始日`} disabled={patient.status === 'SUSPENDED'} {...register('startDate')} />
      <button type="submit" disabled={!formState.isDirty || formState.isSubmitting}>
        設定
      </button>
      <FieldError message={formState.errors.startDate?.message ?? error} />
    </form>
  );
}

export function SuspendForm({ patient, today, onDone }: { patient: Patient; today: string; onDone: () => void }) {
  const { submit, error } = useSubmit();
  const { register, handleSubmit, formState } = useForm<SuspendFormValues>({
    resolver: zodResolver(suspendFormSchema),
    defaultValues: { suspendedOn: today, reason: '' },
  });
  const onSubmit = handleSubmit(async (v) => {
    if (await submit(() => api.patients.suspend(patient.id, v))) onDone();
  });
  return (
    <form onSubmit={onSubmit} className="suspend-form stack">
      <strong>{patient.code} の治療を中断する</strong>
      <p className="hint">中断日より後に始まる配信を停止する。この患者だけが対象で、グループのほかの患者には影響しない。</p>
      <div className="row top wrap">
        <Field label="中断日" error={formState.errors.suspendedOn?.message}>
          <input type="date" {...register('suspendedOn')} />
        </Field>
        <Field label="理由(任意)" error={formState.errors.reason?.message}>
          <input className="wide" {...register('reason')} />
        </Field>
        <button type="submit" className="danger align-end" disabled={formState.isSubmitting}>
          中断して配信を停止する
        </button>
        <button type="button" className="align-end" onClick={onDone}>
          やめる
        </button>
      </div>
      <FieldError message={error} />
    </form>
  );
}

export function PatientActionForm({ patient, action }: { patient: Patient; action: 'cancelSuspension' | 'remove' }) {
  const { submit, error } = useSubmit();
  const { handleSubmit, formState } = useForm();
  const onSubmit = handleSubmit(async () => {
    if (action === 'remove') {
      if (window.confirm(`${patient.code} をグループから外す。よいか?`)) await submit(() => api.patients.remove(patient.id));
    } else {
      await submit(() => api.patients.cancelSuspension(patient.id));
    }
  });
  return (
    <form onSubmit={onSubmit} className="row">
      {action === 'remove' ? (
        <button
          type="submit"
          className="icon-button danger"
          disabled={formState.isSubmitting}
          aria-label={`${patient.code} をグループから外す`}
          title="この患者をグループから外す"
        >
          <Icon name="trash" />
        </button>
      ) : (
        <button type="submit" disabled={formState.isSubmitting}>
          中断を取り消す
        </button>
      )}
      <FieldError message={error} />
    </form>
  );
}
