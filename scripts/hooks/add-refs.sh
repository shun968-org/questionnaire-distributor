#!/usr/bin/env bash
# ブランチ名の issue 番号を Refs: トレーラーとして付ける。
set -euo pipefail

branch="$(git symbolic-ref --short -q HEAD)" || exit 0
[[ "$branch" =~ ^[a-z]+/([0-9]+)- ]] || exit 0
grep -qv '^\s*\(#\|$\)' "$1" || exit 0
git interpret-trailers --in-place --if-exists doNothing --trailer "Refs: #${BASH_REMATCH[1]}" "$1"
