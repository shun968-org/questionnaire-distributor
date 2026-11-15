import { useForm } from 'react-hook-form';
import { api } from '../api/client.ts';
import { Icon } from './icons.tsx';
import { FieldError, useSubmit } from './shared.tsx';

/** 一覧から、質問票または治療計画を削除する */
export function DeleteForm({ kind, id, label }: { kind: 'questionnaires' | 'plans'; id: string; label: string }) {
  const { submit, error } = useSubmit();
  const { handleSubmit, formState } = useForm();
  const onSubmit = handleSubmit(async () => {
    if (!window.confirm(`${label}を削除する。よいか?`)) return;
    await submit(() => api[kind].delete(id));
  });
  return (
    <form onSubmit={onSubmit} className="row">
      <button type="submit" className="icon-button danger" disabled={formState.isSubmitting} aria-label={`${label}を削除`} title={`${label}を削除`}>
        <Icon name="trash" />
      </button>
      <FieldError message={error} />
    </form>
  );
}
