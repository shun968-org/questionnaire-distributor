#!/usr/bin/env bash
# メッセージ未指定のコミットで、ステージした差分と issue から Claude Haiku がメッセージを下書きする。
set -euo pipefail

msg_file="$1"
[ -z "${2:-}" ] || exit 0

branch="$(git symbolic-ref --short -q HEAD)" || exit 0
[[ "$branch" =~ ^[a-z]+/([0-9]+)- ]] || exit 0
issue="${BASH_REMATCH[1]}"

prompt='標準入力の issue とステージ済みの差分から、git のコミットメッセージを 1 つ書く。
- 1 行目: <type>[(scope)]: <要約>
- type: feat / fix / docs / refactor / test / chore / ci のいずれか。scope は任意
- 要約は日本語で、「〜を追加する」「〜を直す」のように動詞の終止形で終える
- 必要なときだけ、空行のあとに本文で理由を短く書く
- Refs: や Co-Authored-By: などのトレーラーは書かない
- コミットメッセージ以外(前置き・説明・コードフェンス)は出力しない'

msg="$({
  gh issue view "$issue" --json number,title,body --template '# Issue #{{.number}}: {{.title}}{{"\n"}}{{.body}}{{"\n"}}' || true
  echo '# ステージ済みの差分'
  git diff --cached
} | claude -p --model haiku --tools "" --no-session-persistence "$prompt")" || exit 0

[ -n "$msg" ] || exit 0
printf '%s\n' "$msg" | cat - "$msg_file" > "$msg_file.tmp"
mv "$msg_file.tmp" "$msg_file"
