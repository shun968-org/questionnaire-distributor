import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useBlocker, useRevalidator } from 'react-router';

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

/**
 * 保存していない変更があるときに、画面を離れる前に確かめる(メニュー・リンク・キャンセル・戻る、のどれでも)。
 * 戻り値の関数を呼ぶと、確かめずに離れられる(保存した後の遷移の前に呼ぶ)
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const allowed = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !allowed.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('保存していない変更がある。破棄して、この画面を離れるか?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  // タブを閉じる・再読み込みするときは、ブラウザの確認を出す
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  return () => {
    allowed.current = true;
  };
}
