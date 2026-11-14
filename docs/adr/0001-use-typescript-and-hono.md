# ADR-0001: 画面と API を TypeScript で実装し、API に Hono を使う

- ステータス: 採用
- 日付: 2026-11-14
- 関連: ADR-0002、ADR-0003

## コンテキスト

治療計画に連動した質問票の配信スケジュールを設定する管理画面と、その値を PostgreSQL に読み書きする API を作る。
当初は API を Go(Echo)で書く想定だったが、DB アクセスに Prisma を使い、学習目的も満たしたい(ADR-0002)。
Go 用の Prisma Client(`steebchen/prisma-client-go`)は Prisma v7 以降に対応せず、非推奨になる予定である。

### 検討した選択肢

| 案 | 却下理由 |
|---|---|
| API を Go(Echo + sqlc)で書き、Prisma はスキーマとマイグレーションの管理だけに使う | Prisma Client を使わないので学習目的を満たさない。スキーマの管理が Node、実行が Go の 2 系統になる |
| 同じ API を Go 版と TypeScript 版の 2 つ作る | 実装量が約 2 倍になる |

## 決定

**画面と API をどちらも TypeScript で実装し、API の HTTP サーバには Hono を使う。**

判断の根拠:

1. **Prisma Client を使える。** 学習目的を満たす。
2. **言語が 1 つで済む。** 画面と API で型を共有でき、実装量が一番少なくなる。

### 規則

| 対象 | 必須 | 禁止 |
|---|---|---|
| リポジトリ全体 | アプリケーションのコードは `apps/web`(画面)と `apps/api`(API)に置く | Go など、TypeScript 以外の言語でアプリケーションのコードを書く(`scripts/` のシェルスクリプトと、ADR-0002 の規則に従って編集する `apps/api/prisma/migrations/` の SQL は対象外) |
| `apps/*` のソース | 拡張子は `.ts` / `.tsx`。`tsconfig` は `"strict": true` | `.js` / `.jsx` のソースを手で書く(ツールの設定ファイルは対象外) |
| `apps/api` | HTTP の受付は Hono で行う。Node 上で `@hono/node-server` を使って起動する | Express、Fastify、NestJS など、Hono 以外の HTTP フレームワークを入れる |

## 結果

- 良い面: Go のインストールと、Go 用の許可ドメイン(`proxy.golang.org`・`sum.golang.org`)の追加が不要になる。
- 受け入れた不利益: Go を使う経験は得られない。
- 未解決の保留事項: なし。
- 移行作業:
  - `apps/web`・`apps/api` を作り、`tsconfig` の `strict` を有効にする。
  - パッケージマネージャ(npm か pnpm か)は、別の ADR または README で決める。
