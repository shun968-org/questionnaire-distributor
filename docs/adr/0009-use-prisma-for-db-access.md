# ADR-0009: DB アクセスに Prisma を使う

- ステータス: 採用
- 日付: 2026-11-15
- 関連: ADR-0002、ADR-0008、ADR-0011

## コンテキスト

ADR-0002 の決定から、アーキテクチャ(構造・レイヤ間の接続方法)に関係しない項目(バージョン、generator・CLI の設定、プレビュー機能、マイグレーションの運用、部分インデックスの書き方、初期データ、許可ドメイン)を外して作り直す。DB アクセスに Prisma を使うことと、Prisma を扱える場所の境界は ADR-0002 と同じである。

API は PostgreSQL に対して、ほぼ取得と登録だけを行う(ADR-0008)。
学習目的で Prisma を使いたい。
後で RLS(行単位のアクセス制御)を入れる予定がある。RLS では、トランザクションごとに `set_config` で値を設定する必要がある。

### 検討した選択肢

| 案 | 却下理由 |
|---|---|
| Drizzle | RLS は素直に書けるが、学習目的を満たさない |
| Kysely | マイグレーションを別に用意する必要があり、学習目的も満たさない |
| SQL を直接書く(pg / postgres.js) | 型の安全性を手で保つ必要があり、実装量が増える |

## 決定

**DB のスキーマ定義・マイグレーション・アクセスには Prisma を使い、Prisma Client を扱えるのは `apps/api` の `repositories/` と `db/` だけにする。**

判断の根拠:

1. **学習目的を満たす。**
2. **CRUD が中心で、Prisma の得意な範囲に収まる。** スキーマ・マイグレーション・初期データの投入を 1 つのツールで管理できる。
3. **Prisma に依存する範囲を、DB のアダプタの層に閉じ込められる。** 上の層は Prisma の型を知らずに済む(ADR-0011)。

### 規則

| 対象 | 必須 | 禁止 |
|---|---|---|
| スキーマ | テーブルの定義は `apps/api/prisma/schema.prisma` に書き、Prisma のマイグレーションで DB に反映する | DB に直接 `CREATE` / `ALTER` を実行して、スキーマを変える |
| Prisma Client を作る場所 | `apps/api/src/db/client.ts` で 1 つだけ作り、それを使う | ほかの場所で `PrismaClient` を作る |
| Prisma Client を import する場所 | 生成された Client を import してよいのは、`apps/api/src/repositories/` と `apps/api/src/db/` だけ | route・service・`apps/web` から、生成された Client を import する(`import type` を含む) |
| 生の SQL | Prisma Client のメソッドで書く。生の SQL は、RLS のための `set_config` を `apps/api/src/db/` で実行する場合だけ使う | 上の場合を除いて、生の SQL を使う。文字列を連結して SQL を組み立てる |

## 結果

- 良い面: スキーマ・マイグレーション・型が 1 か所で管理される。Prisma の変更の影響が `repositories/` と `db/` に収まる。
- 受け入れた不利益: Prisma Client のメソッドで書けない集計は、取得したデータを service で計算する。DB で集計するより遅くなる場合がある。
- 未解決の保留事項: RLS を入れるときは、マイグレーションを実行する DB ユーザー(テーブルの所有者)と、API が接続する DB ユーザーを分ける。テーブルの所有者と superuser には RLS が効かないため。
- 移行作業: Prisma Client を import してよい場所と、生の SQL を使ってよい場所を、lint で検査する。
