# questionnaire-distributor

治療計画に連動して、患者に質問票を配信するスケジュールを設定・管理するシステム。
管理画面と、その設定を PostgreSQL に読み書きする API からなる。

> [!NOTE]
> アプリケーションの実装はまだ始まっていない。現在は開発環境・開発の進め方・技術選定(ADR)を整えている段階。

## 技術スタック

技術選定の経緯と根拠は [`docs/adr/`](docs/adr/) の ADR に残している。

| 対象 | 採用 | ADR |
| --- | --- | --- |
| 言語・API サーバ | TypeScript・Hono | [ADR-0001](docs/adr/0001-use-typescript-and-hono.md) |
| DB アクセス | Prisma(PostgreSQL) | [ADR-0002](docs/adr/0002-use-prisma-for-db-access.md) |
| 管理画面 | Vite + React(CSR) | [ADR-0003](docs/adr/0003-build-admin-ui-as-csr-with-vite-react.md) |
| API の層構成 | route / service / repository | [ADR-0004](docs/adr/0004-layer-api-into-route-service-repository.md) |
| パッケージ管理 | pnpm workspace | [ADR-0005](docs/adr/0005-use-pnpm-workspace.md) |
| Node のバージョン | Node 26(`.nvmrc`) | [ADR-0006](docs/adr/0006-pin-node-26.md) |

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

[lefthook](https://github.com/evilmartians/lefthook) と [Task](https://taskfile.dev/) を入れ、Node は `.nvmrc` のバージョンにそろえたうえで、
`lefthook install` を実行する。この場合、上記のファイアウォールなどの制限はかからないので、AI エージェントを動かすときは注意する。

### トークンの再発行

`GH_TOKEN` が期限切れになったり漏れたりしたときは、**自分のターミナルで** `task rotate-gh-token` を実行する
(トークンが会話やログに残らないよう、AI エージェントには実行させない)。

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
