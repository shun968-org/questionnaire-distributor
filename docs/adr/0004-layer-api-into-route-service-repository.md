# ADR-0004: API を route・service・repository の 3 層に分け、トランザクションを Unit of Work で扱う

- ステータス: 採用
- 日付: 2026-11-14
- 関連: ADR-0001、ADR-0002、ADR-0003

## コンテキスト

API(`apps/api`、ADR-0001)は CRUD が中心だが、配信日の計算や 2 次治療への切り替え(1 次を中断して 2 次を始める)といった、複数の更新を 1 つのトランザクションで行う業務ロジックもある。
ADR-0002 で、生成された Prisma Client を import できるのは `apps/api/src/repositories/` と `apps/api/src/db/` だけと決めた(型だけの import も禁止)。
ただし、変換をどこで行うか、repository が何を返すか、層どうしの依存の向き、トランザクションの受け渡し方は決めていない。
このままでは、repository が Prisma の型をそのまま返したり、service が Prisma のトランザクションのオブジェクト(`tx`)を受け渡したりして、上の層に Prisma の型が漏れる余地がある。
また、後で入れる RLS では、リクエストごとの値(ログインしたユーザーのグループなど)を `set_config` で設定し、それとクエリを同じトランザクションで実行する必要がある(ADR-0002)。

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

1. **service が repository の実装に依存しない。** 依存の向きが型で強制され、service の単体テストでは、その service が使う repository だけを持つ偽の Unit of Work を渡せば済む。
2. **トランザクションの範囲が明示される。** repository は `run` のコールバックでしか受け取れないので、トランザクションの外でデータにアクセスする誤りが起こりにくい。残る誤り(repository の持ち出し、`await` の書き忘れ)は、規則と lint で防ぐ。
3. **RLS を素直に入れられる。** リクエストごとの値は `run` の引数(`RequestContext`)で `db/` まで届き、`run` の最初に `set_config(..., true)` を 1 回実行すれば、そのトランザクションの中のすべてのクエリに効く。
4. **Prisma の型・オブジェクト・例外が、repository と `db/` の外に出ない。**

### 規則

`apps/api/src/` の配置と、各層が import してよいもの(表にない import は禁止):

| 対象 | 置くもの | import してよいもの(アプリ内) | import してよいもの(外部のパッケージ) |
|---|---|---|---|
| `index.ts` | 起動と終了。`db/client.ts` の Client から `createUnitOfWork` で Unit of Work を作り、`createApp({ uow })` に渡す。終了のシグナルを受けたら `$disconnect()` を呼ぶ | `app.ts`・`db/client.ts`・`db/unit-of-work.ts` | `@hono/node-server` |
| `app.ts` | 組み立て(composition root)。`createApp({ uow })` で service と route を作って登録し、エラーを HTTP へ変換する。`AppType` を export する(ADR-0003) | `routes/`・`services/`・`services/ports/`・`errors/` | `hono`・`@hono/node-server`(静的ファイルの配信、ADR-0003) |
| `routes/` | HTTP の入出力。入力の検証と、service の呼び出し | `services/`(引数で受け取る service の型だけ)・`services/ports/`(`RequestContext` の型だけ)・`schemas/`・`errors/` | `hono`・`@hono/` で始まるパッケージ |
| `services/` | 業務ロジックと、トランザクションの範囲 | `services/ports/`・`schemas/domain/`・`errors/` | なし |
| `services/ports/` | repository のインターフェース、それらをまとめた `Repositories` 型、`UnitOfWork<R>`、`RequestContext` | `schemas/domain/` | なし |
| `repositories/` | DB のアダプタ。`services/ports/` のインターフェースの実装と、型の変換 | `services/ports/`・`schemas/domain/`・`errors/`・生成された Prisma Client | なし |
| `db/` | Prisma Client の生成(`client.ts`、ADR-0002)と、`UnitOfWork` の実装(`unit-of-work.ts`) | 生成された Prisma Client・`repositories/`・`services/ports/`・`errors/` | `@prisma/adapter-pg` |
| `schemas/domain/` | 層の間で受け渡すデータの zod のスキーマ(日付は `Date`) | なし | `zod` |
| `schemas/api/` | API のリクエストの zod のスキーマ(日付は文字列) | `schemas/domain/` | `zod` |
| `errors/` | 業務エラーのクラス | なし | なし |

Unit of Work の規則:

| 対象 | 必須 | 禁止 |
|---|---|---|
| インターフェース | `services/ports/` に `UnitOfWork<R>` を `run<T>(ctx: RequestContext, fn: (repos: R) => Promise<T>): Promise<T>` として定義する。`RequestContext` はリクエストごとの値を持つ型とし、認証を入れるまでは項目を持たない | `run` から `ctx` を省く |
| service が受け取る型 | 各 service は、自分が使う repository だけを持つ型で受け取る(例: `UnitOfWork<{ plans: PlanRepo; treatments: TreatmentRepo }>`) | 使わない repository を含む `UnitOfWork<Repositories>` で受け取る |
| 実装 | `db/unit-of-work.ts` の `createUnitOfWork(client)` が `UnitOfWork<Repositories>` を返す。`run` は `client.$transaction(async (tx) => ...)` の中で、`tx` から repository を、最初に使われたときに作って(getter による遅延生成)`fn` に渡す | `run` の外で repository を作る。`UnitOfWork` の実装を `db/` 以外に置く |
| RLS(導入時) | `set_config` は `run` の最初に、`ctx` の値を使って `set_config(..., true)`(トランザクションの中だけ有効)で実行する | 第 3 引数を `false` にする。`run` 以外の場所で `set_config` を実行する |
| repository の扱い | `run` のコールバックの中で、repository の呼び出しはすべて `await` する | コールバックで受け取った repository を、変数・クロージャ・戻り値で `run` の外に持ち出す。`await` せずに呼ぶ |
| エラーの後 | `run` の中で repository のエラーを catch したら、DB へのアクセスを続けずに、再送出するか `run` を終える。やり直す場合は、新しい `run` で行う | エラーを catch した後、同じ `run` の中でクエリを続ける(PostgreSQL ではトランザクション全体が中断されているため) |
| トランザクションのエラー | `db/unit-of-work.ts` で、トランザクション自体のエラー(Prisma の P2028・P2034、コミットや接続の失敗)を `errors/` のクラスに変換して送出する | Prisma の例外を `run` の外に出す |

各層の規則:

| 対象 | 必須 | 禁止 |
|---|---|---|
| service | `createXxxService({ uow })` のように、`UnitOfWork` を引数で受け取る関数にする。各メソッドは `RequestContext` を受け取り、`uow.run` に渡す。データへのアクセスは、すべて `uow.run` のコールバックで受け取った repository を通して行う(読み取りだけの処理も含む)。業務上のエラーは `errors/` のクラスを送出する | repository の実装・Prisma Client・Prisma の `tx` を扱う。Hono の `Context` など、HTTP に関するものを扱う。HTTP のステータスコードを扱う |
| repository | `createXxxRepo(tx)` のように、トランザクションの Client を受け取って `services/ports/` のインターフェースを実装したオブジェクトを返す関数にする。引数と戻り値は、`schemas/domain/` の zod のスキーマから `z.infer` で作った型にする。Prisma の結果と、クエリのエラー(P2002 など)は、repository の中で変換してから返す・送出する。変換の関数は、同じファイルか `repositories/` の中の `*.mapper.ts` に置く | Prisma の型・Prisma のオブジェクト・Prisma の例外を、引数・戻り値・送出する例外として repository の外に出す。repository の中でトランザクションを始める |
| route | `createXxxRoutes({ xxxService })` のように、service を引数で受け取る関数にする。`RequestContext` を作り、入力を `schemas/api/` のスキーマで検証し、service を呼ぶ | 業務ロジックを書く。service を通さずにデータを読み書きする |
| 依存の受け渡し | 依存は関数の引数で渡す。Prisma Client と Unit of Work は `index.ts` で、service と route は `app.ts` の `createApp` で組み立てる | DI コンテナのライブラリを使う。モジュールの最上位で、Unit of Work の実装や service を作って export する |
| エラーの変換 | `errors/` のクラスから HTTP のステータスへの変換は、`app.ts` の `onError` の 1 か所で行う | route や service で、個別にステータスへ変換する |
| zod のスキーマ | 層の間で受け渡すデータは `schemas/domain/` に書く。API のリクエストは `schemas/api/` に書き、`transform` で `schemas/domain/` の型に変換した値を出力するようにする。レスポンスは `schemas/domain/` の型の値を `c.json()` で返す(`Date` は Hono が文字列として型付けする)。型は `z.infer` で作る | 同じデータの型を、zod のスキーマとは別に手で定義する |

## 結果

- 良い面:
  - service の単体テストは、その service が使う repository だけをメモリ上で実装した偽の `UnitOfWork` を渡すだけで書ける。
  - DB の変更、Prisma のバージョンの更新、RLS への対応の影響が、`repositories/` と `db/` に収まる。
  - RLS の `set_config` は、`db/unit-of-work.ts` の `run` の最初に 1 回実行すれば済む。ADR-0002 の結果に書いた、`$extends` で全クエリに `set_config` を差し込む仕組みは不要になる。生の SQL を使うのは、引き続き `db/` の `set_config` だけ(ADR-0002 の規則のとおり)。
- 受け入れた不利益:
  - repository ごとに、インターフェース(`services/ports/`)と、Prisma の型と zod の型の変換のコードを書く。
  - 読み取りだけの処理もトランザクションになるので、少し重くなる。RLS を入れると、どのみちすべての処理がトランザクションになる。
  - `run` の間は DB の接続を 1 本占有する。Prisma の対話型トランザクションには既定の時間制限があるので、`run` の中で外部への通信や重い計算をしない。
  - service のメソッドは、使わない間も `RequestContext` を受け取って `run` に渡す。
- 未解決の保留事項:
  - route で入力を検証する Hono のミドルウェア(`@hono/zod-openapi` か `@hono/zod-validator` か)と、OpenAPI を出力するかどうか(出力する場合のレスポンスのスキーマの置き場所を含む)は、別の ADR で決める。
  - `schemas/` の zod のスキーマを画面のフォームの検証と共有するかどうかは、別の ADR で決める。共有する場合は、ADR-0001 の配置の規則を変える必要がある。
  - エラーのレスポンスの形(JSON の項目)と、`errors/` のクラスの一覧は、別の ADR で決める。
  - `zod` のバージョンは、導入するときに固定する。
- 移行作業:
  - 上の import の規則を lint(ESLint の `no-restricted-imports` か、ディレクトリ単位の境界を検査するプラグイン)で検査する。
  - `run` の中の `await` の書き忘れを、lint(`@typescript-eslint/no-floating-promises`)で検査する。
  - `services/ports/` に `UnitOfWork<R>`・`Repositories`・`RequestContext` を、`db/unit-of-work.ts` に `createUnitOfWork` を作る。
