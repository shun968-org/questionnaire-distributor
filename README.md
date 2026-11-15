# questionnaire-distributor

治療計画に連動して、患者に質問票を配信するスケジュールを設定・管理するシステム。
管理画面と、その設定を PostgreSQL に読み書きする API からなる。

> [!NOTE]
> 最初の設定画面(質問票マスタ・治療計画の配信スケジュール・患者グループ)を実装している段階。
> 患者が回答する画面、回答の閲覧・集計、配信の実行(ワーカー)はまだない。

## 技術スタック

アーキテクチャ(アプリの分け方、レイヤ、依存の規則)は [`docs/adr/`](docs/adr/) の ADR で決めている。ADR にはライブラリの名前を書かないので、採用したものはこの表に書く。

| 役割 | 採用 |
| --- | --- |
| 言語 | TypeScript |
| 実行環境 | Node(バージョンは `.nvmrc`) |
| パッケージ管理 | pnpm workspace |
| API の HTTP フレームワーク | Hono |
| DB | PostgreSQL |
| ORM・マイグレーション | Prisma |
| スキーマの検証 | zod |
| 管理画面 | React(ビルドは Vite) |
| 管理画面のルータ | React Router |
| 管理画面のフォーム | React Hook Form |
| テスト | Vitest(管理画面は jsdom と Testing Library) |
| 開発用の DB の起動 | embedded-postgres(コンテナの中で PostgreSQL を動かす) |

## 開発環境の導入

開発は Dev container の中で行う。コンテナには、AI エージェント(Claude Code)が秘密情報を外に送れないよう、
外向き通信の許可リストなどの制限をかけている。仕組みは [`docs/security-boundaries.md`](docs/security-boundaries.md) を参照。

### 1. 必要なもの

- Docker(Docker Desktop など)
- VS Code と拡張機能 [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- GitHub アカウント(このリポジトリへの書き込み権限)
- Claude Code を使う場合は Anthropic のアカウント

### 2. ホストの VS Code の設定

Dev Containers 拡張は、既定でホストの git の設定・認証情報・SSH エージェントをコンテナに転送する。
コンテナにホストの認証情報を持ち込まないよう、ホストの VS Code の設定(`settings.json`)で止める。

```jsonc
{
  "dev.containers.copyGitConfig": false,
  "dev.containers.gitCredentialHelperConfigLocation": "none"
}
```

SSH エージェントの転送も止める。詳しくは [`docs/security-boundaries.md`](docs/security-boundaries.md) の「残るリスクと運用ルール」と「コンテナ内の認証」を参照。

### 3. リポジトリを clone して `.env` を作る

```sh
git clone https://github.com/shun968-org/questionnaire-distributor.git
cd questionnaire-distributor
cp .env.example .env
```

`.env` に次の値を書く(`.env` は git 管理外)。コンテナ内のプロセス(AI エージェントを含む)から読めるので、
開発用の最小権限の値だけを書き、本番の資格情報は書かない。

| 変数 | 内容 |
| --- | --- |
| `GH_TOKEN` | このリポジトリだけに絞った fine-grained token。権限は Contents・Issues・Pull requests の Read and write。`gh` と `git push` に使う |
| `GIT_USER_NAME` / `GIT_USER_EMAIL` | コミットの作者。メールは GitHub の noreply アドレスを推奨 |
| `NOTION_API_TOKEN` | 要件定義・基本設計を Notion で扱う場合だけ。最小権限の内部インテグレーションのトークン |

`GH_TOKEN` は GitHub の Settings → Developer settings → Fine-grained tokens で作る。作成画面では次のように設定する。

- Resource owner: `shun968-org`
- Repository access: 既定の「All repositories」ではなく、**「Only select repositories」で `questionnaire-distributor` だけ**を選ぶ
  (All のままだと、組織のすべてのリポジトリに届くトークンを AI エージェントに渡すことになる)
- Permissions: Contents・Issues・Pull requests を Read and write

手で作る代わりに、`task rotate-gh-token`(後述)を使ってもよい。権限を入力済みの作成画面の URL を出し、
貼り付けたトークンの対象がこのリポジトリだけであることを確かめてから `.env` に書き込む。

### 4. Dev container を開く

VS Code でリポジトリを開き、コマンドパレットから **Dev Containers: Reopen in Container** を実行する。
次の処理が自動で行われる。

| いつ | 処理 |
| --- | --- |
| コンテナの作成時だけ | `.env` の `GIT_USER_NAME`・`GIT_USER_EMAIL` で git の作者を設定し、lefthook の Git hooks をインストールする(`.devcontainer/setup-git.sh`) |
| 起動のたび | ファイアウォールの適用と、開発で使うホストへの疎通確認(`.devcontainer/check-connectivity.sh`) |
| 起動のたび | `.env` の `GH_TOKEN` で `gh` にログインし、`git push` の認証に使う(`.devcontainer/setup-gh.sh`) |
| 起動のたび | Node のバージョンが `.nvmrc` と一致するかの確認 |

git の作者はコンテナの作成時にしか設定されない。作成後に `.env` の `GIT_USER_NAME`・`GIT_USER_EMAIL` を変えたときは、
**Dev Containers: Rebuild Container** で作り直す(再起動だけでは反映されない)。

起動ログに失敗や警告が出ていないことを確かめ、ターミナルで次を実行して確認する。

```sh
gh auth status   # GH_TOKEN でログインしていること
git config user.name
```

### 5. Claude Code にログインする

コンテナ内のターミナルで `claude` を起動し、画面の案内に従ってログインする。
認証はコンテナ用の名前付きボリュームに保存されるので、コンテナを作り直してもログインし直す必要はない。

### Dev container を使わない場合

Dev container が自動で行うことを手で行う。この場合、上記のファイアウォールなどの制限はかからないので、AI エージェントを動かすときは注意する。

1. 次のツールを入れる。

   | ツール | 使うところ |
   | --- | --- |
   | git・bash・awk・sed・grep | Git hooks(ブランチ名・ADR の検査) |
   | [lefthook](https://github.com/evilmartians/lefthook) | Git hooks の実行 |
   | [GitHub CLI](https://cli.github.com/)(`gh`) | Issue・PR の操作、`task comments`、コミットメッセージの下書き |
   | [Task](https://taskfile.dev/) | `task comments`・`task fix`・`task rotate-gh-token` |
   | [Claude Code](https://docs.anthropic.com/ja/docs/claude-code)(`claude`) | コミットメッセージの下書き(無ければ下書きを省く)、`task fix` |
   | curl・jq | `task rotate-gh-token` |
   | Node(`.nvmrc` のバージョン) | アプリの開発 |

2. `gh` にログインし、`git push` の認証に使う。

   ```sh
   gh auth login
   gh auth setup-git
   ```

3. git の作者を設定し、Git hooks を入れる。

   ```sh
   git config user.name "<名前>"
   git config user.email "<GitHub の noreply アドレス>"
   lefthook install
   ```

### トークンの再発行

`GH_TOKEN` が期限切れになったり漏れたりしたときは、**自分のターミナルで** `task rotate-gh-token` を実行する
(トークンが会話やログに残らないよう、AI エージェントには実行させない)。

## アプリの起動

```sh
pnpm install
pnpm --filter api db:dev        # 開発用の PostgreSQL を起動する(別のターミナルで動かしたままにする)
pnpm --filter api db:migrate    # スキーマを DB に反映し、ORM のクライアントを生成する
pnpm --filter api db:seed       # 初期データを入れる: PRO-CTCAE マスタ(下を参照)と、治療計画のサンプル
pnpm dev                        # API(:3000)と管理画面(:5173)を起動する
```

`db:migrate`・`db:generate` は、Prisma のエンジンを `binaries.prisma.sh` から取得する。Dev container のファイアウォールの
許可リスト(`.devcontainer/init-firewall.sh`)にこのホストがないと失敗する。

テストと型の検査は `pnpm test`・`pnpm typecheck`(API の型の検査は、ORM のクライアントの生成が済んでいること)。

レジメンのテンプレート(`apps/api/src/services/catalog/`)は、質問票と治療計画の初期値を入れるためだけに使う。
PRO-CTCAE の症状と質問(質問文・選択肢)は、ソースに持たず、DB のマスタ(`ProCtcaeSymptom`・`ProCtcaeItem`)に持つ。
元は [PRO-CTCAE 日本語版(JCOG)](https://jcog.jp/assets/pro-ctcae_japanese.pdf) の PDF で、次の順に扱う。PDF もデータファイルも git では管理しない。

```sh
pnpm --filter api pro-ctcae:export        # docs/pro-ctcae_japanese.pdf から、データファイル apps/api/data/pro-ctcae-master.json を書き出す
pnpm --filter api db:import-pro-ctcae     # データファイル(なければ PDF)で、DB のマスタを置き換える。パスを渡すこともできる
```

データファイルを書き出した後は、PDF は要らない(PDF は参考として置いたもので、配布物には入れない)。
マスタを置き換えても、登録済みの質問票は登録したときの文言のまま変わらない。

質問票の中では、PRO-CTCAE の質問文と選択肢は編集できず、API もマスタと違う文言を受け付けない。
マスタが空のまま、またはテンプレートが使う症状がマスタにないまま画面を開くと、API はサーバのエラー(500)を返す。

`db:seed` は、PRO-CTCAE マスタが空ならデータファイル(なければ PDF)から取り込み、続けて治療計画のサンプル
(レジメンのテンプレートごとに、「【サンプル】」で始まる治療計画と、その配信で使う質問票「PRO-CTCAE（A set）」)と、
レジメンによらない短い質問票「PRO-CTCAE（B set）」を登録する。登録済みなら何もしない。
サンプルの配信日(ベースライン、8 日目、15 日目)は画面の見本で、レジメンの資料にあるものではない。

## 開発の進め方

Issue からブランチを切り、PR を rebase マージする。ブランチ名・コミットメッセージ・PR・レビュー対応・ADR の書き方は
[CONTRIBUTING.md](CONTRIBUTING.md) にまとめている。最初に一読すること。

## ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 開発の進め方(Issue・ブランチ・コミット・PR・ADR) |
| [`docs/adr/`](docs/adr/) | 設計判断の記録(ADR) |
| [`docs/security-boundaries.md`](docs/security-boundaries.md) | 開発環境のセキュリティ境界 |

## ライセンス

[GNU Affero General Public License v3.0](LICENSE)(AGPL-3.0)
