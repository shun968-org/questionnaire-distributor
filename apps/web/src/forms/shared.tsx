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

/** 送信して、成功したら画面のデータを読み込み直す */
export function useSubmit() {
  const revalidator = useRevalidator();
  const [error, setError] = useState('');
  const submit = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await revalidator.revalidate();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };
  return { submit, error };
}
