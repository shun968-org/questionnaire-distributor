#!/usr/bin/env bash
# docs/adr/ の ADR が書式に沿っているかと、書かないもの(ライブラリ名・バージョン)を含まないかを検査する
# (書式は managing-adrs スキル)。
# 使い方: scripts/check-adr-format.sh [ファイル...]   省略時は staged の ADR を、staged の内容で検査する
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib/adr.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/adr.sh"

staged=false
files=("$@")
if [ "${#files[@]}" -eq 0 ]; then
  staged=true
  cd "$(git rev-parse --show-toplevel)"
  mapfile -d '' -t files < <(git diff --cached --name-only -z --diff-filter=ACMR -- "$ADR_DIR/*.md")
fi
# staged の検査では、作業ツリーではなくコミットされる内容(index)を読む
content() {
  if $staged; then git show ":$1"; else cat "$1"; fi
}

levels="$(IFS='|'; echo "${ADR_LEVELS[*]}")"

for f in "${files[@]}"; do
  [ "$(basename "$f")" = README.md ] && continue
  body="$(content "$f")"

  [[ "$(basename "$f")" =~ ^[0-9]{4}-[a-z0-9-]+\.md$ ]] \
    || report "$f: ファイル名は 0001-kebab-case.md 形式にする"
  head -1 <<<"$body" | grep -qE '^# ADR-[0-9]{4}: .+' \
    || report "$f: 1行目は '# ADR-XXXX: タイトル' にする"
  grep -qE "^- ステータス: (${ADR_STATUS_VOCAB})$" <<<"$body" \
    || report "$f: '- ステータス:' は 提案中 / 採用 / 却下 / 非推奨 / 置換済み（ADR-XXXX） のいずれか1語にする"
  grep -qE '^- 日付: [0-9]{4}-[0-9]{2}-[0-9]{2}$' <<<"$body" \
    || report "$f: '- 日付: YYYY-MM-DD' が無い"

  grep -qE "^- 階層: (${levels})$" <<<"$body" \
    || report "$f: '- 階層:' は ${ADR_LEVELS[*]} のいずれかにする"
  grep -qE '^- 対象: .+' <<<"$body" \
    || report "$f: '- 対象: 決定を適用する範囲' が無い"
  grep -qE '^- 上位: (なし|ADR-[0-9]{4})$' <<<"$body" \
    || report "$f: '- 上位:' は なし か ADR-XXXX にする"

  # コードフェンス内の見出しは数えない
  outside="$(adr_outside_fences <<<"$body")"
  headings="$(grep '^## ' <<<"$outside" || true)"
  [ "$headings" = $'## コンテキスト\n## 決定\n## 結果' ] \
    || report "$f: 見出しは '## コンテキスト' '## 決定' '## 結果' の3つをこの順で置く"
  decision="$(awk '/^## 決定$/ { p = 1; next } /^## / { p = 0 } p' <<<"$outside")"
  for section in "${ADR_DECISION_SECTIONS[@]}"; do
    grep -qxF "### $section" <<<"$decision" \
      || report "$f: 「決定」に '### $section' が無い"
  done

  # 書かないもの。行番号を付けて報告する
  while IFS= read -r term; do
    [[ -z "$term" || "$term" == \#* ]] && continue
    # shellcheck disable=SC2001  # 複数の記号を 1 度にエスケープする
    escaped="$(sed 's/[][\\.^$*+?(){}|]/\\&/g' <<<"$term")"
    hit="$(grep -niE "(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)" <<<"$body" | head -1 | cut -d: -f1 || true)"
    [ -z "$hit" ] \
      || report "$f:$hit: ライブラリ・ツールの名前 '$term' を書かない(役割で書く。例: ORM、HTTP のフレームワーク)"
  done <"$ADR_BANNED_TERMS_FILE"
  hit="$(grep -nE '(^|[^0-9A-Za-z./-])v?[0-9]+\.[0-9]+' <<<"$body" | head -1 | cut -d: -f1 || true)"
  [ -z "$hit" ] \
    || report "$f:$hit: バージョン番号を書かない"
done

[ "$violations" -eq 0 ]
