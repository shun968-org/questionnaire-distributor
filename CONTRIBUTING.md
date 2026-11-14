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

## 設計判断の記録

技術選定などの判断は `docs/adr/` に ADR として残す。Claude に書かせるときは `/managing-adrs`(または「ADR を書いて」)。
