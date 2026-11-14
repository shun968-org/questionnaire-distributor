# ADR-0004: API を route・service・repository の 3 層に分け、トランザクションを Unit of Work で扱う

- ステータス: 採用
- 日付: 2026-11-14
- 関連: ADR-0001、ADR-0002、ADR-0003

## コンテキスト

API(`apps/api`、ADR-0001)は CRUD が中心だが、配信日の計算や 2 次治療への切り替え(1 次を中断して 2 次を始める)といった、複数の更新を 1 つのトランザクションで行う業務ロジックもある。
ADR-0002 で、生成された Prisma Client を import できるのは `apps/api/src/repositories/` と `apps/api/src/db/` だけと決めた(型だけの import も禁止)。
ただし、変換をどこで行うか、repository が何を返すか、層どうしの依存の向き、トランザクションの受け渡し方は決めていない。
このままでは、repository が Prisma の型をそのまま返したり、service が Prisma のトランザクションのオブジェクト(`tx`)を受け渡したりして、上の層に Prisma の型が漏れる余地がある。
また、後で入れる RLS では、`set_config` とクエリを同じトランザクションで実行する必要がある(ADR-0002)。

### 検討した選択肢

| 案 | 却下理由 |
|---|---|
| service が repository の実装を直接 import し、トランザクションは AsyncLocalStorage で暗黙に受け渡す | service が repository の実装に依存する。repository がトランザクションの中で呼ばれているかがコードから見えず、トランザクションの外で呼んでも動いてしまう。RLS では全クエリに `$extends` で `set_config` を差し込む必要がある |
| service がトランザクションのオブジェクトを引数で受け取り、repository の関数に渡す | service が repository の実装に依存し、Prisma の `tx` の型が service を通る |
| ドメインのエンティティを別に定義するクリーンアーキテクチャ | CRUD が中心の規模では、エンティティと変換のコードが増えるだけで、得るものが少ない |
| repository とは別に、変換だけを行う adapter の層を置く | 変換のためだけに層が増え、Prisma の型を扱う層が 2 つに広がる |

## 決定

**API を route・service・repository の 3 層に分ける。service は自分が定義するインターフェース(ports)だけに依存し、データへのアクセスは Unit of Work の `run` の中で、そこで受け取った repository を通して行う。repository は DB のアダプタとし、Prisma の型と zod のスキーマから作った型との変換を repository の中で行う。**

判断の根拠:

1. **service が repository の実装に依存しない。** 依存の向きが型で強制され、service の単体テストでは偽の Unit of Work を渡すだけで済む。
2. **トランザクションの範囲が明示される。** repository は `run` の中でしか手に入らないので、トランザクションの外でデータにアクセスする誤りが起こらない。
3. **RLS を素直に入れられる。** `run` の最初に `set_config` を 1 回実行すれば、そのトランザクションの中のすべてのクエリに効く。
4. **Prisma の型が repository と `db/` の外に出ない。**

### 規則

`apps/api/src/` の配置と、各層が import してよいもの:

| 対象 | 置くもの | import してよいもの |
|---|---|---|
| `index.ts` | `@hono/node-server` での起動(ADR-0001) | `app.ts` |
| `app.ts` | 組み立て(composition root)。Unit of Work の実装を service に、service を route に渡す。エラーの HTTP への変換。`AppType` を export する(ADR-0003) | `routes/`・`services/`・`db/unit-of-work.ts`・`errors/` |
| `routes/` | HTTP の入出力。入力の検証と、service の呼び出し | `services/`(引数で受け取る service の型だけ)・`schemas/`・`errors/` |
| `services/` | 業務ロジックと、トランザクションの範囲 | `services/ports/`・`schemas/`・`errors/` |
| `services/ports/` | service が必要とする repository のインターフェースと、`UnitOfWork` のインターフェース | `schemas/` |
| `repositories/` | DB のアダプタ。`services/ports/` のインターフェースの実装と、型の変換 | `services/ports/`・`schemas/`・`errors/`・生成された Prisma Client |
| `db/` | Prisma Client の生成(ADR-0002)と、`UnitOfWork` の実装(`db/unit-of-work.ts`) | 生成された Prisma Client・`repositories/`・`services/ports/` |
| `schemas/` | API の入出力と、層の間で受け渡すデータの zod のスキーマ | `zod` だけ |
| `errors/` | 業務エラーのクラス | なし |

各層の必須と禁止:

| 対象 | 必須 | 禁止 |
|---|---|---|
| import の向き | 上の表の「import してよいもの」だけを import する | 表にない import。特に、`services/` から `repositories/`・`db/` を import する。`routes/` から `repositories/`・`db/` を import する |
| Unit of Work | `services/ports/` に `UnitOfWork` のインターフェース(`run<T>(fn: (repos) => Promise<T>): Promise<T>`)を定義する。`db/unit-of-work.ts` で、`prisma.$transaction(async (tx) => ...)` の中で `tx` から repository を作り、`fn` に渡す | `run` の外で repository を作る・使う。`UnitOfWork` の実装を `db/` 以外に置く |
| service | `createXxxService({ uow })` のように、`UnitOfWork` を引数で受け取る関数にする。データへのアクセスは、すべて `uow.run` のコールバックで受け取った repository を通して行う(読み取りだけの処理も含む)。業務上のエラーは `errors/` のクラスを送出する | repository の実装・Prisma Client・Prisma の `tx` を扱う。Hono の `Context` など、HTTP に関するものを import する。HTTP のステータスコードを扱う |
| repository | `createXxxRepo(tx)` のように、トランザクションの Client を受け取って `services/ports/` のインターフェースを実装したオブジェクトを返す関数にする。引数と戻り値は、`schemas/` の zod のスキーマから `z.infer` で作った型にする。Prisma の結果は、repository の中で変換してから返す。変換の関数は、同じファイルか `repositories/` の中の `*.mapper.ts` に置く | Prisma の型・Prisma のオブジェクト・Prisma の例外を、引数・戻り値・送出する例外として repository の外に出す。repository の中でトランザクションを始める |
| route | `createXxxRoutes({ xxxService })` のように、service を引数で受け取る関数にする。入力を `schemas/` の zod のスキーマで検証し、service を呼ぶ。レスポンスは `schemas/` のスキーマの形で返す | 業務ロジックを書く。service を通さずにデータを読み書きする |
| 依存の受け渡し | 依存は関数の引数で渡し、組み立ては `app.ts` だけで行う | DI コンテナのライブラリを使う。モジュールの最上位で、Unit of Work の実装や service を作って export する |
| エラーの変換 | `errors/` のクラスから HTTP のステータスへの変換は、`app.ts` の `onError` の 1 か所で行う | route や service で、個別にステータスへ変換する |
| zod のスキーマ | API の入出力の形とルールは `schemas/` にだけ書く。型は `z.infer` で作り、同じ形の型を手で書かない | 同じデータの型を、zod のスキーマとは別に手で定義する |

## 結果

- 良い面:
  - service の単体テストは、メモリ上の repository を返す偽の `UnitOfWork` を渡すだけで書ける。
  - DB の変更、Prisma のバージョンの更新、RLS への対応の影響が、`repositories/` と `db/` に収まる。
  - RLS の `set_config` は、`db/unit-of-work.ts` の `run` の最初に 1 回実行すれば済む。ADR-0002 の結果に書いた、`$extends` で全クエリに `set_config` を差し込む仕組みは不要になる。生の SQL を使うのは、引き続き `db/` の `set_config` だけ(ADR-0002 の規則のとおり)。
- 受け入れた不利益:
  - repository ごとに、インターフェース(`services/ports/`)と、Prisma の型と zod の型の変換のコードを書く。
  - 読み取りだけの処理もトランザクションになるので、少し重くなる。RLS を入れると、どのみちすべての処理がトランザクションになる。
  - `run` の間は DB の接続を 1 本占有する。Prisma の対話型トランザクションには既定の時間制限があるので、`run` の中で外部への通信や重い計算をしない。
- 未解決の保留事項:
  - route で入力を検証する Hono のミドルウェア(`@hono/zod-openapi` か `@hono/zod-validator` か)と、OpenAPI を出力するかどうかは、別の ADR で決める。
  - `schemas/` の zod のスキーマを画面のフォームの検証と共有するかどうかは、別の ADR で決める。共有する場合は、ADR-0001 の配置の規則を変える必要がある。
  - エラーのレスポンスの形(JSON の項目)は、別の ADR で決める。
  - `zod` のバージョンは、導入するときに固定する。
- 移行作業:
  - 上の import の規則を lint(ESLint の `no-restricted-imports` か、ディレクトリ単位の境界を検査するプラグイン)で検査する。
  - `services/ports/` に `UnitOfWork` のインターフェースを、`db/unit-of-work.ts` にその実装を作る。
