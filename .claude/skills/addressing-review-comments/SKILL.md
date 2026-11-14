---
name: addressing-review-comments
description: PR のレビュー指摘のうち、ユーザーが指定したものに対応する。修正コミット、指摘への返信、スレッドの resolve までを行う。`task fix` から呼ばれるほか、「この指摘に対応して」「レビューコメントを直して」といった依頼が該当する。
---

# レビュー指摘への対応

引数: `<PR番号> <指摘番号>... [補足の指示]`。指摘番号は `task comments` の 1 列目(PR 内の通し番号)。

## 1. 準備する

```sh
gh pr checkout <PR番号>
git pull --ff-only
scripts/review-threads.sh <PR番号> --all --ids   # 番号・状態・場所・見出し・コメントID・スレッドID
gh api repos/{owner}/{repo}/pulls/comments/<コメントID> --jq .body   # 指摘の全文
```

- 指定された指摘だけを扱う。指定外の指摘には触れない
- 指摘番号からコメント ID とスレッド ID を引く
- 指定した番号が無い、または resolved 済みなら、作業せずにユーザーに伝える

## 2. 修正してコミットする

指摘ごとに次を行う。補足の指示があれば従う。

1. 修正する
2. 関連するファイルだけを `git add <ファイル>` する
3. `git commit --no-edit`(メッセージは hook が下書きする)。`git log -1 --format=%B` で確認し、合わなければ `git commit --amend -m` で直す
4. 1 指摘 1 コミット。`Co-Authored-By:` は付けない

補足で「対応しない」と指示された指摘はコミットせず、4 で理由を返信する。

## 3. push する

```sh
git push
```

## 4. 返信して resolve する

指摘ごとに次を行う。

```sh
gh api repos/{owner}/{repo}/pulls/<PR番号>/comments/<コメントID>/replies \
  -f body="<短いハッシュ> で対応しました。<何をしたかを 1〜2 文>"
gh api graphql -F id=<スレッドID> \
  -f query='mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { isResolved } } }'
```

最後に `scripts/review-threads.sh <PR番号>` で残りの指摘を確認し、対応したコミットと残りをユーザーに伝える。
