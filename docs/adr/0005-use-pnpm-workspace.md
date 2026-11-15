# ADR-0005: パッケージマネージャに pnpm を使い、apps を pnpm workspace で管理する

- ステータス: 置換済み（ADR-0012）
- 日付: 2026-11-15
- 関連: ADR-0001、ADR-0002、ADR-0003、ADR-0006

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

1. **依存の依存を import できない。** pnpm は各パッケージの `node_modules` に、その `package.json` に書いた依存だけを置き、依存の依存は置かない。ただし Node は親のディレクトリの `node_modules` も辿るので、ルートに置いた依存は apps から宣言なしで import できてしまう。この抜け道は lint で塞ぐ(規則)。
2. **依存パッケージの install 時のスクリプトを、許可したものだけに絞れる。** pnpm 10 以降は、既定で依存のスクリプトを実行しない。この ADR で固定する pnpm 12 では、許可していない依存のスクリプトがあると install がエラー(`ERR_PNPM_IGNORED_BUILDS`)で止まるので、許可の漏れにも気づける。
3. **追加の導入が要らない。** Dev container に既に入っており、取得先も許可済み。

### 規則

| 対象 | 必須 | 禁止 |
|---|---|---|
| リポジトリのルート | `package.json` の `packageManager` に、pnpm の正確なバージョン(`pnpm@12.21.0`)を固定する。`pnpm-workspace.yaml` に `apps/*` を書く。ルートの `devDependencies` には、リポジトリ全体で使う開発用のツール(TypeScript・ESLint など)だけを置く | ルートにアプリケーションのコードを置く。ルートの `dependencies` に依存を書く |
| apps の import | import するパッケージを、その apps の `package.json` に書く。lint(`import/no-extraneous-dependencies`)で検査する | ルートの `package.json` にだけ書いたパッケージを、apps のコードから import する |
| ロックファイル | `pnpm-lock.yaml` を Git で管理する。CI では `pnpm install --frozen-lockfile` で入れる | `package-lock.json`・`yarn.lock` を置く |
| 依存の追加・実行 | 追加は `pnpm add`、実行は `pnpm --filter <パッケージ> <スクリプト>`・`pnpm exec`・`pnpm dlx` を使う | `npm install`・`yarn add` で依存を入れる。`npx` で実行する |
| 依存の install 時のスクリプト | 実行が必要なもの(Prisma・esbuild など)だけを、`pnpm approve-builds <パッケージ>` で `pnpm-workspace.yaml` の `allowBuilds` に 1 つずつ許可する | `pnpm approve-builds --all` などで、まとめて許可する。pnpm 10 より前のバージョンを使う |
| `apps/web` から `apps/api` の参照 | ADR-0003 のとおり、`apps/api/src/app.ts` の `AppType` をファイルのパスで `import type` する。`hc` を使うため、`hono` を `apps/web` の `package.json` に書く | `apps/api` を `apps/web` の依存に書く(`workspace:` プロトコルを含む)。パッケージ名での import は、パスで書いた ADR-0003 の lint をすり抜け、`AppType` 以外も import できてしまうため |

## 結果

- 良い面: 依存の依存を誤って import しなくなる。宣言していない依存の import は lint で検出できる。依存の install 時のスクリプトを許可したものだけに絞れる。
- 受け入れた不利益: 依存を巻き上げる前提のツールは、追加の設定(`public-hoist-pattern` など)が要ることがある。依存を足すたびに、install 時のスクリプトの許可が要るかを判断する手間が増える。
- 未解決の保留事項: Node のバージョンと、それを固定する方法(`engines`・`.node-version` など)は、`apps/` を作るときに決める。
- 移行作業:
  - ルートに `package.json`(`packageManager` を含む)と `pnpm-workspace.yaml` を作る。
  - `apps/web` の `package.json` に `hono` を書き、`apps/api` の型は ADR-0003 のとおりファイルのパスで参照する。
  - CI で `pnpm install --frozen-lockfile` を実行し、`package-lock.json`・`yarn.lock` が無いことを確かめる。npm・yarn で入れた変更は、これで止める。
  - 宣言していない依存の import を、lint(`import/no-extraneous-dependencies`)で検査する。
  - ADR-0002 の `prisma generate` を実行する手順を、ルートと `apps/api` の `package.json` のスクリプトに置く。
- 追記(2026-11-15): 「未解決の保留事項」の Node のバージョンと固定する方法は、ADR-0006 で Node 26 に決め、`.nvmrc` を基準にすることにした。
