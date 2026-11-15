#!/usr/bin/env bash
# コミットに ADR の変更(削除・改名を含む)があるときだけ、ADR の書式と運用規則を検査する。
# lefthook の glob は削除を含まないため、ここで staged の変更を見て判定する。
set -euo pipefail
scripts="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source-path=SCRIPTDIR source=../lib/adr.sh
source "$scripts/lib/adr.sh"

# ADR_DIR はリポジトリのルートからの相対パス
cd "$(git rev-parse --show-toplevel)"
[ -n "$(git diff --cached --name-only -- "$ADR_DIR/")" ] || exit 0

# 両方の検査の結果をまとめて出す
rc=0
"$scripts/check-adr-format.sh" || rc=1
"$scripts/check-adr-rules.sh" --staged || rc=1
exit "$rc"
