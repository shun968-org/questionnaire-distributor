#!/usr/bin/env bash
# 使い方: scripts/review-threads.sh [PR番号] [--all] [--ids]
# 出力(TSV): 番号  状態  場所  見出し  [コメントID  スレッドID]
# 番号は PR 内のスレッドの作成順(resolved も含めて数える)
set -euo pipefail

filter='select(.resolved | not)'
cols='.no, .state, .loc, .title'
pr=""
for arg in "$@"; do
  case "$arg" in
    --all) filter='.' ;;
    --ids) cols="$cols, .comment, .thread" ;;
    *) pr="$arg" ;;
  esac
done
pr="${pr:-$(gh pr view --json number -q .number)}"

# shellcheck disable=SC2016
gh api graphql -F pr="$pr" -F owner='{owner}' -F repo='{repo}' -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id isResolved path line
          comments(first: 1) { nodes { databaseId body } }
        }
      }
    }
  }
}' --jq ".data.repository.pullRequest.reviewThreads.nodes | to_entries[]
  | .value.comments.nodes[0] as \$c
  | {no: (.key + 1), resolved: .value.isResolved,
     state: (if .value.isResolved then \"resolved\" else \"open\" end),
     loc: \"\(.value.path):\(.value.line)\",
     title: (\$c.body | split(\"\n\")[0] | gsub(\"\\\\*\\\\*\"; \"\") | .[0:60]),
     comment: \$c.databaseId, thread: .value.id}
  | $filter | [$cols] | @tsv"
