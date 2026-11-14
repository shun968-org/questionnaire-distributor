---
name: creating-prs
description: Issue を起点にブランチを切り、PR を作成するときに使う。Issue の作成・確認、`gh issue develop` によるブランチ作成と Issue への紐づけ、Conventional Commits 形式の PR タイトル、テンプレートに沿った PR 本文と `Closes #番号` を扱う。「PR を作る」「PR を出す」「ブランチを切る」「この Issue に着手する」「変更をプルリクにする」といった作業が該当する。
---

# Issue 駆動での PR 作成

## 1. Issue を用意する

既存の Issue があればその番号を使う。無ければ作る。

機能・タスク:

```sh
gh issue create --title "<要約>" --label enhancement --body-file - <<'EOF'
## やりたいこと

## 背景・理由

## 完了条件

- [ ]
EOF
```

不具合:

```sh
gh issue create --title "<要約>" --label bug --body-file - <<'EOF'
## 何が起きたか

## 期待する動作

## 再現手順

1.
EOF
```

## 2. ブランチを作る

```sh
gh issue develop <番号> --base main --name <種別>/<番号>-<内容> --checkout
```

- 名前: `<種別>/<番号>-<内容>`（例: `feat/12-questionnaire-schedule`）
- 種別: `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `ci`
- 内容: 英小文字の kebab-case
- `git checkout -b` は使わない

## 3. コミットする

`<type>: <要約>`（Conventional Commits）。`Refs: #<番号>` は hook が付けるので書かない。

コミットは粒度を変えずに `main` へ入る。1 コミット 1 変更にし、PR 前に `git rebase` で整える。

## 4. PR を作る

```sh
git push -u origin HEAD
gh pr create --base main --title "<type>: <要約>" --body-file - <<'EOF'
## 概要

<何を・なぜ変えたか>

Closes #<番号>

## 確認したこと

- [ ] <実行したテスト・動作確認>
EOF
```

- タイトル: `<type>: <要約>`
- `Closes #<番号>` は必須。複数なら `Closes #12, closes #13`
- `--fill` は使わない
- 作成後、PR の URL をユーザーに伝える
