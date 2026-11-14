#!/usr/bin/env bash
# docs/adr/ の ADR が Nygard 形式に沿っているかを検査する(書式は managing-adrs スキル)。
# 使い方: scripts/check-adr-format.sh [ファイル...]   省略時は staged の ADR
set -euo pipefail

files=("$@")
if [ "${#files[@]}" -eq 0 ]; then
  mapfile -d '' -t files < <(git diff --cached --name-only -z --diff-filter=ACMR -- 'docs/adr/*.md')
fi

STATUS_VOCAB='提案中|採用|却下|非推奨|置換済み（ADR-[0-9]{4}）'
violations=0
report() {
  echo "NG: $1" >&2
  violations=$((violations + 1))
}

for f in "${files[@]}"; do
  [ "$(basename "$f")" = README.md ] && continue

  [[ "$(basename "$f")" =~ ^[0-9]{4}-[a-z0-9-]+\.md$ ]] \
    || report "$f: ファイル名は 0001-kebab-case.md 形式にする"
  head -1 "$f" | grep -qE '^# ADR-[0-9]{4}: .+' \
    || report "$f: 1行目は '# ADR-XXXX: タイトル' にする"
  grep -qE "^- ステータス: (${STATUS_VOCAB})$" "$f" \
    || report "$f: '- ステータス:' は 提案中 / 採用 / 却下 / 非推奨 / 置換済み（ADR-XXXX） のいずれか1語にする"
  grep -qE '^- 日付: [0-9]{4}-[0-9]{2}-[0-9]{2}$' "$f" \
    || report "$f: '- 日付: YYYY-MM-DD' が無い"

  # コードフェンス内の見出しは数えない
  headings="$(awk '/^```/ { in_fence = !in_fence; next } !in_fence && /^## /' "$f")"
  [ "$headings" = $'## コンテキスト\n## 決定\n## 結果' ] \
    || report "$f: 見出しは '## コンテキスト' '## 決定' '## 結果' の3つをこの順で置く"
done

[ "$violations" -eq 0 ]
