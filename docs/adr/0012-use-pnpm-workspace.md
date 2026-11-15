# ADR-0012: apps を pnpm workspace のパッケージとして管理する

- ステータス: 採用
- 日付: 2026-11-15
- 関連: ADR-0005、ADR-0008、ADR-0010

## コンテキスト

ADR-0005 の決定から、アーキテクチャ(構造・レイヤ間の接続方法)に関係しない項目(pnpm のバージョンとその振る舞い、ロックファイル・依存の追加と実行のコマンド・install 時のスクリプトの許可の運用)を外して作り直す。pnpm workspace でパッケージを分けることと、パッケージ間の依存の規則は ADR-0005 と同じである。外した運用は CONTRIBUTING に移す。

ADR-0008 で、画面(`apps/web`)と API(`apps/api`)を TypeScript で 1 つのリポジトリに置くことにした。
2 つのアプリの依存パッケージを入れ、`apps/web` から `apps/api` の型を参照する(ADR-0010)ため、複数パッケージの管理方法を決める必要がある。

働いている力:

- ADR-0009・ADR-0010 は、import してよいものを lint で検査する。`package.json` に書いていないパッケージを import できてしまうと、依存の宣言と実際の import がずれる。
- 依存パッケージの install 時のスクリプトは、知らないうちに任意のコードを実行できる。

### 検討した選択肢

| 案 | 却下理由 |
|---|---|
| npm(npm workspaces) | 依存を `node_modules` の直下に巻き上げるので、`package.json` に書いていないパッケージも import できてしまう。依存パッケージの install 時のスクリプトは既定で実行される |
| Yarn(Berry) | Dev container に入っておらず、追加の導入が要る。Plug'n'Play はエディタや一部のツールに追加の設定が要る |
| Bun | パッケージマネージャだけを使っても実行環境(Node)と 2 系統になる |

## 決定

**`apps/web`・`apps/api` を pnpm workspace のパッケージとして管理し、各パッケージは自分が import するものを自分の `package.json` に書く。`apps/web` は `apps/api` をパッケージとしては依存に持たない。**

判断の根拠:

1. **依存の依存を import できない。** pnpm は各パッケージの `node_modules` に、その `package.json` に書いた依存だけを置く。ルートに置いた依存は親のディレクトリを辿って import できてしまうので、lint で塞ぐ。
2. **依存パッケージの install 時のスクリプトを、許可したものだけに絞れる。**
3. **追加の導入が要らない。** Dev container に既に入っている。

### 規則

| 対象 | 必須 | 禁止 |
|---|---|---|
| リポジトリのルート | workspace のパッケージは `apps/*` にする。ルートには、リポジトリ全体で使う開発用のツールだけを置く | ルートにアプリケーションのコードや、アプリケーションの依存を置く |
| パッケージの依存 | import するパッケージを、その apps の `package.json` に書く | ほかのパッケージやルートにだけ書いたパッケージを import する |
| `apps/web` から `apps/api` の参照 | ADR-0010 のとおり、`apps/api/src/app.ts` の `AppType` をファイルのパスで `import type` する。`hc` を使うため、`hono` を `apps/web` の `package.json` に書く | `apps/api` を `apps/web` の依存に書く(パッケージ名での import は、パスで書いた ADR-0010 の lint をすり抜け、`AppType` 以外も import できてしまうため) |

## 結果

- 良い面: 依存の依存を誤って import しなくなる。宣言していない依存の import は lint で検出できる。依存の install 時のスクリプトを許可したものだけに絞れる。
- 受け入れた不利益: 依存を巻き上げる前提のツールは、追加の設定が要ることがある。
- 未解決の保留事項: なし。
- 移行作業: ルートに `package.json` と `pnpm-workspace.yaml` を作る。宣言していない依存の import を lint で検査する。
