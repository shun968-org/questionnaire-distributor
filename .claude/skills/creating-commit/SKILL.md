---
name: creating-commit
description: 現在のブランチの issue に関係する変更をステージングしてコミットするときに使う。ブランチ名からの issue 番号の特定、関係するファイルだけのステージング、hook(Claude Haiku)によるメッセージの下書きと確認、Conventional Commits 形式と `Refs: #番号` を扱う。「コミットして」「変更をコミットする」「ここまでをコミット」といった作業が該当する。
---

# コミット

## 1. issue を特定する

```sh
git branch --show-current
gh issue view <番号>
```

- ブランチ名 `<種別>/<番号>-<内容>` から番号を取る
- 形が合わなければコミットせず、ユーザーに伝える

## 2. ステージングする

```sh
git status --short
git diff
git add <ファイル>...
```

- issue に関係するファイルだけを個別に add する
- `git add -A` / `git add .` は使わない
- 話題が混ざっていれば、1 コミット 1 変更になるよう分けてコミットする

## 3. コミットする

```sh
git commit --no-edit
```

- hook が差分と issue からメッセージを下書きし、`Refs: #<番号>` を付ける
- 空メッセージで中断されたら、下記の書式で `git commit -m` する

## 4. 確認する

```sh
git log -1 --format=%B
```

書式に合わなければ `git commit --amend -m "<直したメッセージ>"` で直す。

## メッセージフォーマット

```text
<type>[(scope)]: <要約>

Refs: #<issue番号>
```

- type: `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `ci`
- scope は任意
- 要約は日本語で「〜を追加する」のように動詞の終止形で終える
- 本文は必要なときだけ、要約との間に空行を入れて書く
- `Co-Authored-By:` は付けない
