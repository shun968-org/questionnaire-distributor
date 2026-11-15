# ADR-0007: 管理画面のルータに React Router、フォームに React Hook Form を使う

- ステータス: 採用
- 日付: 2026-11-15
- 関連: ADR-0003、ADR-0004、ADR-0005

## コンテキスト

ADR-0003 で、管理画面(`apps/web`)を Vite と React の SPA にし、API は Hono RPC(`hc<AppType>`)で呼ぶと決めた。ルータとフォームのライブラリは、別の ADR で決めることにした。

働いている力:

- 画面は、治療計画・患者グループ・患者の一覧と詳細、配信スケジュールの編集など、複数の画面を URL で行き来する。
- 治療計画の編集では、カレンダーに質問票を置く・外すといった、標準の入力欄ではない部品で値を入力する。
- 入力の検証には zod を使う(ADR-0004)。スキーマを API と共有するかは、ADR-0004 で別の ADR に回した。
- 技術選定では、学習目的として、広く使われている技術を学べるかも判断の基準にする。
- React Router には、使い方(モード)が 3 つある。宣言型(`<BrowserRouter>`)、データ(`createBrowserRouter` と `loader`)、フレームワーク(`@react-router/dev` の Vite プラグイン。旧 Remix)。

### 検討した選択肢

| 案 | 却下理由 |
|---|---|
| ルータに TanStack Router | パスとクエリのパラメータを型で検査できるが、利用者が React Router より少ない。ファイルからルートを生成するには Vite のプラグインが要る |
| ルータに wouter | データの読み込み(`loader`)や、移動中の状態が無く、自分で作る必要がある |
| React Router のフレームワークのモード | ADR-0003 で禁止した Remix にあたる。SSR を前提にした仕組み(Vite のプラグイン、ルートのモジュールの規約)が増える |
| フォームに TanStack Form | 型の推論は強いが、利用者が React Hook Form より少なく、1.x の更新が速い |
| フォームにライブラリを使わない(`useState` と zod の `safeParse`) | エラーの表示、入力済みかどうか、送信中の状態などを画面ごとに自分で作ることになる |

## 決定

**管理画面のルータに React Router をデータのモード(`createBrowserRouter`)で使い、フォームに React Hook Form を使って、zod のスキーマで検証する。**

判断の根拠:

1. **利用者が一番多い。** React Router と React Hook Form は、それぞれの分野で最も広く使われており、学習目的に合う。
2. **SPA のまま、画面のデータの読み込みをルートに置ける。** データのモードでは、ルートの `loader` で API を呼んでから画面を描くので、画面ごとの読み込み中の状態の扱いが揃う。
3. **検証を zod のスキーマ 1 か所に寄せられる。** `@hookform/resolvers` の `zodResolver` で、フォームの検証に zod のスキーマを使える。カレンダーのような独自の部品も `Controller` で同じフォームに入れられる。

### 規則

| 対象 | 必須 | 禁止 |
|---|---|---|
| ルータ | `react-router` のデータのモードを使う。ルートは `createBrowserRouter` で定義し、`react-router/dom` の `RouterProvider` で描く | フレームワークのモード(`@react-router/dev`)、宣言型のモード(`<BrowserRouter>`・`<Routes>`)を使う。ほかのルータのライブラリを入れる |
| 画面のデータの読み込み | 画面を開くときに要るデータは、ルートの `loader` で `hc` から API を呼んで取得する | 画面を開くときのデータの取得を、コンポーネントの `useEffect` で行う |
| フォーム | `react-hook-form` の `useForm` で状態を持つ。検証は `@hookform/resolvers/zod` の `zodResolver` に zod のスキーマを渡して行う。標準の入力欄でない部品は `Controller`(または `useController`)でつなぐ | フォームの入力値を `useState` に写して管理する。`register` の `required`・`pattern` などの検証のオプションで、zod のスキーマと別に検証を書く |
| フォームの送信 | `handleSubmit` の中で `hc` から API を呼ぶ。送信後に画面のデータを読み直すときは、`useRevalidator` か画面の移動で `loader` を再実行する | React Router の `<Form>` と `action` で送信する(送信の経路が 2 つになるため) |
| API のエラーの表示 | API が返した入力のエラーは、`setError` で該当する入力欄に表示する | API のエラーをフォームの外の状態で別に管理する |

## 結果

- 良い面: 画面の遷移とデータの読み込み、フォームの状態と検証の作り方が、画面ごとに揃う。広く使われている作り方を学べる。
- 受け入れた不利益: URL のクエリのパラメータは型で検査されないので、`loader` で zod のスキーマを使って検証する。`loader` の取得結果はキャッシュされないので、同じデータを複数の画面で使うと、そのたびに API を呼ぶ。React Router のメジャーバージョンの更新に追従する手間がかかる。
- 未解決の保留事項:
  - フォームの zod のスキーマを API の `schemas/` と共有するかは、ADR-0004 の保留事項のとおり別の ADR で決める。それまでは `apps/web` の中にフォーム用のスキーマを置く。
  - API のエラーのレスポンスの形は ADR-0004 の保留事項のとおり別の ADR で決める。`setError` に渡す変換は、その形が決まってから作る。
  - 取得結果のキャッシュ(TanStack Query などの導入)は、同じデータの再取得が問題になったときに決める。
- 移行作業:
  - `apps/web` に `react-router`・`react-hook-form`・`@hookform/resolvers`・`zod` を入れる(ADR-0005 のとおり `pnpm add` で、`apps/web` の `package.json` に書く)。
  - `react-router` の宣言型のモードのコンポーネント(`BrowserRouter`・`Routes`)と `Form`、`@react-router/dev` の import を、lint(`no-restricted-imports`)で禁止する。
