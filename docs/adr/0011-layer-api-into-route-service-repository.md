# ADR-0011: API を route・service・repository の 3 層に分け、トランザクションを Unit of Work で扱う

- ステータス: 採用
- 日付: 2026-11-15
- 関連: ADR-0004、ADR-0008、ADR-0009、ADR-0010

## コンテキスト

ADR-0004 の決定から、アーキテクチャ(構造・レイヤ間の接続方法)に関係しない細部(Prisma のエラーコード、repository の生成の仕方、`zod` のバージョン、lint の規則の名前)を外して作り直す。層の分け方、依存の向き、トランザクションの受け渡し方は ADR-0004 と同じである。

API(`apps/api`、ADR-0008)は CRUD が中心だが、配信日の計算や 2 次治療への切り替え(1 次を中断して 2 次を始める)といった、複数の更新を 1 つのトランザクションで行う業務ロジックもある。
ADR-0009 で、Prisma Client を扱えるのは `apps/api/src/repositories/` と `apps/api/src/db/` だけと決めた。
ただし、変換をどこで行うか、repository が何を返すか、層どうしの依存の向き、トランザクションの受け渡し方は決めていない。
このままでは、repository が Prisma の型をそのまま返したり、service が Prisma のトランザクションのオブジェクト(`tx`)を受け渡したりして、上の層に Prisma の型が漏れる余地がある。
また、後で入れる RLS では、リクエストごとの値(ログインしたユーザーのグループなど)を `set_config` で設定し、それとクエリを同じトランザクションで実行する必要がある。
phase 2 以降はクラウドに展開して複数人が同時に使い、質問票の配信を HTTP 以外のワーカー(スケジュールに従って動く処理)で行う想定である。ワーカーからも同じ業務ロジック(配信日の計算など)を使い、患者やグループの単位でトランザクションを区切る必要がある。同時に使う人が増えるとデッドロックや直列化の失敗が起きうるので、トランザクションの単位でのやり直しも要る。

### 検討した選択肢

| 案 | 却下理由 |
|---|---|
| service が repository の実装を直接 import し、トランザクションは AsyncLocalStorage で暗黙に受け渡す | service が repository の実装に依存する。repository がトランザクションの中で呼ばれているかがコードから見えず、トランザクションの外で呼んでも動いてしまう |
| リクエストごとに 1 つのトランザクションを Hono のミドルウェアで張り、repository を Hono の Context に置いて service に渡す | HTTP にしか効かないので、配信のワーカーで使えない。トランザクションをやり直すには handler 全体をやり直す必要がある。外部への送信の前にコミットするといった区切りができない |
| service がトランザクションのオブジェクトを引数で受け取り、repository の関数に渡す | service が repository の実装に依存し、Prisma の `tx` の型が service を通る |
| ドメインのエンティティを別に定義するクリーンアーキテクチャ | CRUD が中心の規模では、エンティティと変換のコードが増えるだけで、得るものが少ない |
| repository とは別に、変換だけを行う adapter の層を置く | 変換のためだけに層が増え、Prisma の型を扱う層が 2 つに広がる |

## 決定

**API を route・service・repository の 3 層に分ける。service は自分が定義するインターフェース(ports)だけに依存し、データへのアクセスは Unit of Work の `run` の中で、そこで受け取った repository を通して行う。repository は DB のアダプタとし、Prisma の型と zod のスキーマから作った型との変換を repository の中で行う。**

判断の根拠:

1. **トランザクションを業務の単位で区切れる。** 範囲を HTTP のリクエストではなく service が決めるので、配信のワーカーなど HTTP 以外の処理からも同じ service を呼べる。失敗時は新しい `run` でやり直せる。外部への送信の前に `run` を終えてコミットする、といった区切りもできる。
2. **service が repository の実装に依存しない。** 依存の向きが型で強制され、service の単体テストでは、その service が使う repository だけを持つ偽の Unit of Work を渡せば済む。
3. **トランザクションの範囲が明示される。** repository は `run` のコールバックでしか受け取れないので、トランザクションの外でデータにアクセスする誤りが起こりにくい。
4. **RLS の値の経路が、HTTP とワーカーで共通になる。** リクエストごと(ワーカーでは処理の単位ごと)の値を `RequestContext` で `run` に渡し、`run` の最初に `set_config` で設定する。
5. **Prisma の型・オブジェクト・例外が、repository と `db/` の外に出ない。**

### 規則

`apps/api/src/` の配置と、各層が依存してよいもの(表にない依存は禁止):

| 対象 | 置くもの | 依存してよいもの(アプリ内) | 依存してよいもの(外部のパッケージ) |
|---|---|---|---|
| `index.ts` | 起動と終了。Prisma Client から Unit of Work を作り、`createApp({ uow })` に渡す | `app.ts`・`db/` | Hono の Node 用のサーバ |
| `app.ts` | 組み立て(composition root)。service と route を作って登録し、エラーを HTTP へ変換する。`AppType` を export する(ADR-0010) | `routes/`・`services/`・`services/ports/`・`errors/` | Hono |
| `routes/` | HTTP の入出力。入力の検証と、service の呼び出し | `services/`(引数で受け取る service の型だけ)・`services/ports/`(`RequestContext` の型だけ)・`schemas/`・`errors/` | Hono |
| `services/` | 業務ロジックと、トランザクションの範囲 | `services/ports/`・`schemas/domain/`・`errors/` | なし |
| `services/ports/` | repository のインターフェース、それらをまとめた `Repositories` 型、`UnitOfWork<R>`、`RequestContext` | `schemas/domain/` | なし |
| `repositories/` | DB のアダプタ。`services/ports/` のインターフェースの実装と、型の変換 | `services/ports/`・`schemas/domain/`・`errors/`・Prisma Client | なし |
| `db/` | Prisma Client の生成と、`UnitOfWork` の実装 | Prisma Client・`repositories/`・`services/ports/`・`errors/` | Prisma のドライバアダプタ |
| `schemas/domain/` | 層の間で受け渡すデータの zod のスキーマ | なし | zod |
| `schemas/api/` | API のリクエストの zod のスキーマ | `schemas/domain/` | zod |
| `errors/` | 業務エラーのクラス | なし | なし |

層の接続の規則:

| 対象 | 必須 | 禁止 |
|---|---|---|
| Unit of Work | `services/ports/` に `UnitOfWork<R>` を `run<T>(ctx: RequestContext, fn: (repos: R) => Promise<T>): Promise<T>` として定義する。実装は `db/` に置き、`run` の中でトランザクションを張って、そのトランザクションにひも付いた repository を `fn` に渡す | `run` から `ctx` を省く。`run` の外で repository を作る |
| service | `UnitOfWork` を引数で受け取る関数にし、自分が使う repository だけを持つ型で受け取る。データへのアクセスは、すべて `uow.run` のコールバックで受け取った repository を通して行う(読み取りだけの処理も含む) | repository の実装・Prisma Client・Prisma の `tx` を扱う。HTTP に関するもの(Hono の `Context`、ステータスコード)を扱う |
| repository | トランザクションの Client を受け取って `services/ports/` のインターフェースを実装する。引数と戻り値は `schemas/domain/` の型にし、Prisma の結果とエラーは repository の中で変換する | Prisma の型・オブジェクト・例外を repository の外に出す。repository の中でトランザクションを始める |
| route | service を引数で受け取る関数にする。`RequestContext` を作り、入力を `schemas/api/` のスキーマで検証し、service を呼ぶ | 業務ロジックを書く。service を通さずにデータを読み書きする |
| トランザクションの範囲 | repository の呼び出しは `run` のコールバックの中で行う。外部への送信は、`run` を終えて(コミットして)から行う | repository を `run` の外に持ち出す。`run` の中で外部への送信をする |
| RLS(導入時) | `run` の最初に、`ctx` の値をトランザクションの中だけ有効な `set_config` で設定する | `run` 以外の場所で `set_config` を実行する |
| 依存の受け渡し | 依存は関数の引数で渡す。Prisma Client と Unit of Work は `index.ts` で、service と route は `app.ts` で組み立てる | DI コンテナのライブラリを使う。モジュールの最上位で、Unit of Work の実装や service を作って export する |
| エラーの変換 | `errors/` のクラスから HTTP のステータスへの変換は、`app.ts` の 1 か所で行う。トランザクション自体のエラーも、`db/` で `errors/` のクラスに変換する | route や service で、個別にステータスへ変換する |
| 型 | 層の間で受け渡すデータの型は `schemas/domain/` の zod のスキーマから作る。API のリクエストは `schemas/api/` で検証し、`schemas/domain/` の型に変換して service に渡す | 同じデータの型を、zod のスキーマとは別に手で定義する |

## 結果

- 良い面:
  - service の単体テストは、その service が使う repository だけをメモリ上で実装した偽の `UnitOfWork` を渡すだけで書ける。
  - DB の変更、Prisma の更新、RLS への対応の影響が、`repositories/` と `db/` に収まる。
  - RLS の `set_config` は、`run` の最初に 1 回実行すれば済む。
- 受け入れた不利益:
  - repository ごとに、インターフェース(`services/ports/`)と、Prisma の型と zod の型の変換のコードを書く。
  - 読み取りだけの処理もトランザクションになるので、少し重くなる。
  - `run` の間は DB の接続を 1 本占有するので、`run` の中で外部への通信や重い計算をしない。
- 未解決の保留事項:
  - route で入力を検証する方法と、OpenAPI を出力するかどうかは、別の ADR で決める。
  - `schemas/` の zod のスキーマを画面と共有するかどうかは、別の ADR で決める。
  - エラーのレスポンスの形と、`errors/` のクラスの一覧は、別の ADR で決める。
  - 複数人が同時に使うときの対策(楽観ロック、トランザクションの分離レベル、やり直しの方針)は、別の ADR で決める。
  - 配信のワーカーの実行方法(プロセスの分け方、`RequestContext` に入れる値)は、phase 2 で配信を作るときに決める。
- 移行作業: 上の依存の規則と、`run` の中の `await` の書き忘れを lint で検査する。
