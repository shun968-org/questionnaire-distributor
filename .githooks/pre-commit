#!/usr/bin/env bash
# ブランチ名が <種別>/<issue番号>-<内容> 形式でなければコミットを止める。
set -euo pipefail

# rebase 中などブランチ外のコミットは対象外
branch="$(git symbolic-ref --short -q HEAD)" || exit 0
if [[ ! "$branch" =~ ^(feat|fix|docs|refactor|test|chore|ci)/[0-9]+-[a-z0-9-]+$ ]]; then
  echo "NG: ブランチ名 '$branch' は <種別>/<issue番号>-<内容> にする(gh issue develop で作る)" >&2
  exit 1
fi
