# CONTRIBUTING

## Issue

作業は必ず Issue から始める(No Issue, No Branch)。テンプレートは `.github/ISSUE_TEMPLATE/`。

## ブランチ

- `main` に直接 push しない。作業は `main` から切ったブランチで行い、PR でマージする。
- ブランチは `gh issue develop` で作り、Issue に紐づける(`git checkout -b` では紐づかない)。
- ブランチ名: `<種別>/<issue番号>-<内容>`(例: `feat/12-questionnaire-schedule`、`fix/34-login-redirect`)。種別はコミットと同じ。

```sh
gh issue develop 12 --base main --name feat/12-questionnaire-schedule --checkout
```

## コミット

[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/) に従う。

```
<type>[(scope)]: <要約>
```

`type`: `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `ci`。scope は任意。要約は日本語で「〜を追加する」のように書く。

Dev container 以外の環境では [lefthook](https://github.com/evilmartians/lefthook) をインストールして `lefthook install` を実行する。

コミットはそのまま `main` に入るので、粒度と内容を整えてから PR を出す。

Claude にコミットさせるときは `/creating-commit`(または「コミットして」)。

## PR とマージ

1. PR を作る(テンプレートに沿って概要と確認内容を書く)。`Closes #番号` で Issue を紐付ける(必須)。タイトルは Conventional Commits 形式。
2. GitHub の画面から **rebase マージ**する(squash・merge commit は無効)。コミットは粒度を変えずに `main` へ直線で並ぶ。
   - マージには、ブランチが最新の `main` を含み、必須のチェック adr-check が成功していることが要る。ほかの PR が先にマージされてブランチが古くなったら、PR の画面の **Update branch** で rebase を選んで更新する(adr-check が走り直す)。更新した後は、手元のブランチも `git pull --rebase` で合わせる。

```sh
gh pr create --title "feat: <要約>"   # 本文は対話またはテンプレートで個別に書く(--fill は使わない)
```

Issue の用意からブランチ作成・PR 作成までを Claude にさせるときは `/creating-prs`(または「PR を作って」)。

### レビュー指摘への対応

指摘に対応するかは人が判断し、対応するものだけを Claude に任せる。

```sh
task comments                  # 未解決の指摘を一覧する(1 列目が PR 内の指摘番号)
task fix -- 1 3                # 指定した指摘を修正・コミット・push し、返信して resolve する
task fix -- 1 3 "3 は対応しない" # 補足の指示を付ける
task fix PR=16 -- 2            # 今のブランチ以外の PR を指定する
```

`main` の履歴は直線(マージコミットなし)に保つ。`main` への force push・削除は禁止。
作業ブランチを `main` に追従させるときは rebase し、自分のブランチへの `git push --force-with-lease` は可。

## リポジトリ設定

リポジトリを作り直したときや、マージ方法・`main` の保護の設定を戻すときは、次を実行する(要: リポジトリの admin 権限)。

```sh
scripts/setup-github-repo.sh
```

## 開発環境と依存の扱い

ADR に書かない、ツールの運用と実装上の決まり。

- **Node のバージョン**: ルートの `.nvmrc` だけに書き、ほかのファイル(`engines.node` など)には書かない。Dev container の Node は `.nvmrc` に合わせる。Node を使う CI のジョブを作るときは、`actions/setup-node` の `node-version-file: .nvmrc` で入れる。`scripts/check-node-version.sh` が、動いている Node と Dev container の設定のメジャーバージョンを `.nvmrc` と比べる(コンテナの起動時に警告する)。
- **pnpm**: ルートの `package.json` は、`apps/` を作るときに用意する。そのとき、バージョンは `packageManager` で固定し、`preinstall` から `scripts/check-node-version.sh` を実行する。依存の追加は `pnpm add`、実行は `pnpm --filter`・`pnpm exec`・`pnpm dlx` を使い、`npm install`・`yarn add`・`npx` は使わない。`pnpm-lock.yaml` をコミットし、依存を入れる CI のジョブを作るときは `pnpm install --frozen-lockfile` を使う。依存の install 時のスクリプトは、要るものだけを `pnpm approve-builds <パッケージ>` で 1 つずつ許可する。
- **管理画面の秘密情報**: `VITE_` で始まる環境変数はビルド結果に埋め込まれるので、公開してよい値だけを入れる。localStorage・sessionStorage には表示の設定だけを置き、トークン・患者の ID・配信スケジュールのデータは置かない。

## 設計判断の記録

アーキテクチャの決定は `docs/adr/` に ADR として残す。Claude に書かせるときは `/managing-adrs`(または「ADR を書いて」)。

- **書くもの**: 採用するアーキテクチャスタイル(レイヤードなど)、構成要素(アプリ・レイヤ)の責務、依存の規則(どこからどこを import してよいか)、構成要素の間の接続の規則。
- **書かないもの**: 具体的にどのライブラリ・ツールを使うか、バージョン、ツールの設定や運用の細目。ライブラリは役割で書き(「ORM」「HTTP のフレームワーク」)、採用したものは README の「技術スタック」の表に書く。運用の決まりは、上の「開発環境と依存の扱い」に書く。
- **階層**: システム → アプリ → レイヤの順に、上から決める。下の階層の ADR は、上の階層の ADR を `- 上位:` に書き、その範囲の中で決める。

ADR を含むコミットでは、pre-commit で書式と書かないもの(`scripts/check-adr-format.sh`。ライブラリ・ツールの名前は `scripts/lib/adr-banned-terms.txt` の一覧と照らすので、依存を足したら一覧にも足す)と運用規則(`scripts/check-adr-rules.sh`)を検査する。`ADR_ALLOW_ADOPTED_EDIT=1 git commit` は、採用済み ADR の書き換えの検査(タイトル・日付・「コンテキスト」「決定」と、「結果」の既存の行)をすべて警告に下げる。採用済み ADR の誤字・リンクだけを直すコミットに限って使い、ほかの変更と混ぜない。

PR では CI(`.github/workflows/adr-check.yml`)が、PR を取り込んだ結果を最新の `main` と比べて同じ検査をする。採用済み ADR の誤字・リンクだけを直す PR には、ラベル `adr-allow-adopted-edit` を付けて書き換えの検査を警告に下げる(通した書き換えは PR の画面に warning として出る)。ラベルは後の push にも効くので、その PR に別の変更を足すときはラベルを外す。adr-check は main の保護で必須のチェックにしており、ブランチを最新の `main` にしてからでないとマージできないので、ADR の PR が同時に開いていても、先にマージされた ADR との番号の重なりは更新後の検査で検出される。

ADR の全体を作り直す(旧 ADR をすべて削除して `0001` から書き直す)ときだけ、`ADR_ALLOW_RESET=1 git commit` で、`main` と比べる検査(削除・改名、採用済み ADR の書き換え、番号)を飛ばす。PR にはラベル `adr-allow-reset` を付ける。
