# CONTRIBUTING

## ブランチ

- `main` に直接 push しない。作業は `main` から切ったブランチで行い、PR でマージする。
- ブランチ名: `<種別>/<内容>`(例: `feat/questionnaire-schedule`、`fix/login-redirect`)。種別はコミットと同じ。

## コミット

[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/) に従う。

```
<type>: <要約>
```

`type`: `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `ci`

## PR とマージ

1. PR を作る(テンプレートに沿って概要と確認内容を書く)。関連 issue は `Closes #番号` で紐付ける。
2. **squash マージのみ**。PR タイトルがそのまま `main` のコミットメッセージになるため、タイトルも Conventional Commits 形式にする。
3. マージ後のブランチは自動で削除される。

```sh
gh pr create --fill
gh pr merge --squash
```

`main` の履歴は直線(マージコミットなし)に保つ。`main` への force push・削除は禁止。
作業ブランチを `main` に追従させるときは rebase し、自分のブランチへの `git push --force-with-lease` は可。

## リポジトリ設定

上記のルールは GitHub 側で強制している。設定は `scripts/setup-github-repo.sh` で反映する(要: リポジトリの admin 権限)。

| 設定 | 値 |
|---|---|
| マージ方法 | squash のみ(merge commit・rebase merge は無効) |
| マージ後のブランチ削除 | 有効 |
| `main` の ruleset | PR 必須(承認数 0)・直線履歴・force push 禁止・削除禁止 |

## 設計判断の記録

技術選定などの判断は `docs/adr/` に ADR として残す(`managing-adrs` skill 参照)。
