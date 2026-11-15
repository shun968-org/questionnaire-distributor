# ADR-0005: パッケージマネージャに pnpm を使い、apps を pnpm workspace で管理する

- ステータス: 採用
- 日付: 2026-11-15
- 関連: ADR-0001、ADR-0002、ADR-0003

## コンテキスト

ADR-0001 で、画面(`apps/web`)と API(`apps/api`)を TypeScript で 1 つのリポジトリに置くことにした。
2 つのアプリの依存パッケージを入れ、`apps/web` から `apps/api` の型を参照する(ADR-0003)ため、パッケージマネージャと複数パッケージの管理方法を決める必要がある。

働いている力:

- ADR-0002・ADR-0003 は、import してよいものを lint で検査する。`package.json` に書いていないパッケージを import できてしまうと、依存の宣言と実際の import がずれる。
- Dev container には Node の機能で npm と pnpm が入っている。パッケージの取得先 `registry.npmjs.org` はファイアウォールで許可済み。
- 依存パッケージの install 時のスクリプト(`postinstall` など)は、知らないうちに任意のコードを実行できる。コンテナ内では `.env` のトークンが読める。

### 検討した選択肢

| 案 | 却下理由 |
|---|---|
| npm(npm workspaces) | 依存を `node_modules` の直下に巻き上げるので、`package.json` に書いていないパッケージも import できてしまう。依存パッケージの install 時のスクリプトは既定で実行される |
| Yarn(Berry) | Dev container に入っておらず、追加の導入が要る。Plug'n'Play はエディタや一部のツールに追加の設定が要る |
| Bun | パッケージマネージャだけを使っても実行環境(Node)と 2 系統になる。ADR-0001 で API は Node 上で動かすと決めている |

## 決定

**パッケージマネージャに pnpm を使い、`apps/web`・`apps/api` を pnpm workspace のパッケージとして管理する。**

判断の根拠:

1. **宣言していない依存を import できない。** pnpm は各パッケージの `node_modules` に、`package.json` に書いた依存だけを置く。ADR-0002・ADR-0003 の import の規則と、依存の宣言がずれない。
2. **依存パッケージの install 時のスクリプトを、許可したものだけに絞れる。** pnpm は既定で依存のスクリプトを実行せず、許可したパッケージだけを実行する。
3. **追加の導入が要らない。** Dev container に既に入っており、取得先も許可済み。

### 規則

| 対象 | 必須 | 禁止 |
|---|---|---|
| リポジトリのルート | `package.json` の `packageManager` に pnpm のバージョンを固定する。`pnpm-workspace.yaml` に `apps/*` を書く | ルートに アプリケーションのコードや依存を置く(開発用のツールは対象外) |
| ロックファイル | `pnpm-lock.yaml` を Git で管理する。CI では `pnpm install --frozen-lockfile` で入れる | `package-lock.json`・`yarn.lock` を置く |
| 依存の追加・実行 | 追加は `pnpm add`、実行は `pnpm --filter <パッケージ> <スクリプト>`・`pnpm exec`・`pnpm dlx` を使う | `npm install`・`yarn add` で依存を入れる。`npx` で実行する |
| 依存の install 時のスクリプト | 実行が必要なもの(Prisma・esbuild など)だけを、`pnpm-workspace.yaml` で明示的に許可する | すべての依存のスクリプトを一括で許可する |
| workspace 内の参照 | ほかの workspace のパッケージを依存に書くときは `workspace:` プロトコルを使う | 相対パスやバージョン番号で、ほかの workspace のパッケージを依存に書く |

## 結果

- 良い面: 依存の宣言漏れが install の時点で表に出る。依存の install 時のスクリプトを許可したものだけに絞れる。
- 受け入れた不利益: 依存を巻き上げる前提のツールは、追加の設定(`public-hoist-pattern` など)が要ることがある。依存を足すたびに、install 時のスクリプトの許可が要るかを判断する手間が増える。
- 未解決の保留事項: なし。
- 移行作業:
  - ルートに `package.json`(`packageManager` を含む)と `pnpm-workspace.yaml` を作る。
  - `apps/web` から `apps/api` の型を参照する方法(ADR-0003)を、`workspace:` プロトコルの依存として用意する。
  - ADR-0002 の `prisma generate` を実行する手順を、ルートと `apps/api` の `package.json` のスクリプトに置く。
