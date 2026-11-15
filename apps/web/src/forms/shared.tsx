import { type ReactNode, useState } from 'react';
import { useRevalidator } from 'react-router';

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="error">{message}</p> : null;
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
      <FieldError message={error} />
    </label>
  );
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : '送信に失敗した');

/**
 * フォームの送信。失敗したら、エラーの文言を持つ。
 * revalidate(既定は true): 成功したら、いまの画面のデータを読み込み直す。送信の後に別の画面へ移るなら false にする。
 * 読み込み直しの失敗は、送信の失敗にしない(登録は済んでいる)
 */
export function useSubmit({ revalidate = true }: { revalidate?: boolean } = {}) {
  const revalidator = useRevalidator();
  const [error, setError] = useState('');
  const submit = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
    if (revalidate) {
      await revalidator.revalidate().catch(() => setError('登録は済んだが、画面の読み込み直しに失敗した。ページを再読み込みする'));
    }
    return true;
  };
  return { submit, error };
}
