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

Refs: #<issue番号>
```

`type`: `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `ci`。scope は任意。要約は日本語で「〜を追加する」のように書く。

トレーラーは `Refs:` のみ。`Co-Authored-By:`(AI ツールが付けるものを含む)は付けない。

git hook は [lefthook](https://github.com/evilmartians/lefthook)(`lefthook.yml`)で登録する。Dev container では自動で入る。それ以外の環境では lefthook をインストールして `lefthook install` を実行する。

| hook | 内容 |
|---|---|
| pre-commit | ブランチ名が `<種別>/<issue番号>-<内容>` でなければコミットを止める |
| prepare-commit-msg | `-m` などでメッセージを指定しないとき、ステージした差分と issue から Claude Haiku がメッセージを下書きする(`claude` と `gh` にログインが必要。失敗したら下書きなし) |
| commit-msg | ブランチ名の issue 番号を `Refs: #N` として付ける |

コミットはそのまま `main` に入るので、粒度と内容を整えてから PR を出す。

## PR とマージ

1. PR を作る(テンプレートに沿って概要と確認内容を書く)。`Closes #番号` で Issue を紐付ける(必須)。タイトルは Conventional Commits 形式。
2. GitHub の画面から **rebase マージ**する(squash・merge commit は無効)。コミットは粒度を変えずに `main` へ直線で並ぶ。
3. マージ後のブランチは自動で削除される。

```sh
gh pr create --title "feat: <要約>"   # 本文は対話またはテンプレートで個別に書く(--fill は使わない)
```

`main` の履歴は直線(マージコミットなし)に保つ。`main` への force push・削除は禁止。
作業ブランチを `main` に追従させるときは rebase し、自分のブランチへの `git push --force-with-lease` は可。

## リポジトリ設定

上記のルールは GitHub 側で強制している。設定は `scripts/setup-github-repo.sh` で反映する(要: リポジトリの admin 権限)。

| 設定 | 値 |
|---|---|
| マージ方法 | rebase のみ(merge commit・squash は無効) |
| マージ後のブランチ削除 | 有効 |
| `main` の ruleset | PR 必須(承認数 0)・直線履歴・force push 禁止・削除禁止 |

## 設計判断の記録

技術選定などの判断は `docs/adr/` に ADR として残す(`managing-adrs` skill 参照)。
