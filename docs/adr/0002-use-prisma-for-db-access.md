# ADR-0002: DB アクセスに Prisma を使う

- ステータス: 採用
- 日付: 2026-11-14
- 関連: ADR-0001

## コンテキスト

API は PostgreSQL に対して、ほぼ取得と登録だけを行う(ADR-0001)。
学習目的で Prisma を使いたい。
後で RLS(行単位のアクセス制御)を入れる予定がある。RLS では、トランザクションごとに `set_config` で値を設定する必要がある。
2026-11-14 時点で npm の安定版の最新は `prisma` / `@prisma/client` ともに 7.10.1(2026-10-15 公開)である。`prisma` の `latest` タグは 8.0.0 の RC(リリース候補)を指しているが、安定版ではないので対象にしない。
Prisma 7 では、Client は `prisma-client` ジェネレーターで指定したフォルダに生成し、そこから import する。DB への接続にはドライバアダプタ(PostgreSQL では `@prisma/adapter-pg`)を使い、CLI の設定は `prisma.config.ts` に書く。
`@prisma/engines` はインストール時に `binaries.prisma.sh` からマイグレーション用のエンジンを取得する。

### 検討した選択肢

| 案 | 却下理由 |
|---|---|
| Drizzle | RLS は素直に書けるが、学習目的を満たさない |
| Kysely | マイグレーションを別に用意する必要があり、学習目的も満たさない |
| SQL を直接書く(pg / postgres.js) | 型の安全性を手で保つ必要があり、実装量が増える |

## 決定

**DB のスキーマ定義・マイグレーション・アクセスには Prisma 7.10.1 を使う。**

判断の根拠:

1. **学習目的を満たす。**
2. **CRUD が中心で、Prisma の得意な範囲に収まる。** スキーマ・マイグレーション・初期データの投入を 1 つのツールで管理できる。

### 規則

| 対象 | 必須 | 禁止 |
|---|---|---|
| バージョン | `prisma`・`@prisma/client`・`@prisma/adapter-pg` を 7.10.1 に固定する(`^` や `~` を付けない) | バージョンを範囲で指定する。RC など安定版でないバージョンを使う。ADR を改めずにメジャーバージョンを上げる |
| CLI の設定 | `apps/api/prisma.config.ts` に、スキーマのパス・マイグレーションのパス・初期データの投入コマンドを書く | `package.json` の `prisma` キーに設定を書く |
| Client の生成 | `schema.prisma` のジェネレーターは `provider = "prisma-client"`、`output = "../src/generated/prisma"` にする。生成先の `apps/api/src/generated/prisma/` は `.gitignore` に入れる | `prisma-client-js` ジェネレーターを使う。生成されたファイルを手で編集する。生成されたファイルをコミットする |
| DB への接続 | `@prisma/adapter-pg` のドライバアダプタを `PrismaClient` に渡して接続する | ドライバアダプタを使わずに接続する |
| スキーマ | テーブルの定義は `apps/api/prisma/schema.prisma` にだけ書く | DB に直接 `CREATE` / `ALTER` を実行して、スキーマを変える |
| マイグレーション | `prisma migrate dev` で生成した `apps/api/prisma/migrations/` をコミットする | `prisma db push` を使う。コミット済みのマイグレーションを書き換える |
| マイグレーションの SQL の手での編集 | Prisma のスキーマでは書けないもの(CHECK 制約、部分インデックス、RLS のポリシー)に限る。編集した箇所には、その理由をコメントで書く | 上の 3 つ以外の目的で、生成された SQL を手で書き換える |
| Prisma Client を作る場所 | `apps/api/src/db/client.ts` で 1 つだけ作り、それを使う | ほかの場所で `new PrismaClient()` を実行する |
| Prisma Client を import する場所 | 生成された Client(`apps/api/src/generated/prisma/`)を import してよいのは、`apps/api/src/repositories/` と `apps/api/src/db/` だけ | route・service・`apps/web` から、生成された Client を import する。型だけの import(`import type`)も含めて禁止する。アプリケーションのコードから `@prisma/client` を直接 import する |
| 生の SQL | Prisma Client のメソッド(`findMany`・`create`・`groupBy` など)で書く。生の SQL を使ってよいのは、RLS のための `set_config` を `$executeRaw` のタグ付きテンプレートで実行する場合だけとし、書く場所は `apps/api/src/db/` だけとする | 上の場合を除いて、`$queryRaw`・`$executeRaw`・`$queryRawUnsafe`・`$executeRawUnsafe`・`$queryRawTyped` を使う。文字列を連結して SQL を組み立てる |
| 初期データ | `apps/api/prisma/seed.ts` に書き、`prisma.config.ts` に登録したコマンドを `prisma db seed` で実行して投入する | マイグレーションの中に初期データを入れる |

## 結果

- 良い面: スキーマ・マイグレーション・型が 1 か所で管理される。
- 受け入れた不利益:
  - RLS を入れるときは、Prisma の `$extends` を使い、トランザクションの中で `set_config` を実行する工夫が要る。`set_config` の実行には `$executeRaw` が要るので、生の SQL はこの用途に限って使ってよいとする。
  - Prisma Client のメソッドで書けない集計は、取得したデータを service で計算する。DB で集計するより遅くなる場合がある。
- 未解決の保留事項:
  - Prisma 8 が安定版になったときに上げるかどうか。上げる場合は新しい ADR を起こす。
- 移行作業:
  - `binaries.prisma.sh` を許可ドメインとして `.devcontainer/init-firewall.sh` に追加する(PR で確認する)。
  - Prisma Client を import してよい場所を、lint(`no-restricted-imports`)で検査する。型だけの import も検査の対象にする。
  - 生の SQL のメソッドの使用を、lint(`no-restricted-syntax`)で検査する。`apps/api/src/db/` の `set_config` を実行する箇所だけ、検査から除外する。
