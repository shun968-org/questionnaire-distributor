import { isRouteErrorResponse, NavLink, Outlet, useNavigation, useRouteError } from 'react-router';

export function Layout() {
  const navigation = useNavigation();
  return (
    <>
      <header className="app-header">
        <strong>質問票配信の管理</strong>
        <nav>
          <NavLink to="/questionnaires">質問票マスタ</NavLink>
          <NavLink to="/plans">治療計画</NavLink>
          <NavLink to="/groups">患者グループ</NavLink>
        </nav>
        {navigation.state === 'loading' && <span className="hint">読み込み中…</span>}
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

export function ErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error);
  return (
    <main>
      <h2>読み込みに失敗した</h2>
      <p className="error">{message}</p>
      <a href="/">最初の画面に戻る</a>
    </main>
  );
}
