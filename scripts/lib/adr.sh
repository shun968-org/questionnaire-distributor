# shellcheck shell=bash disable=SC2034  # 変数は source した側で使う
# check-adr-format.sh と check-adr-rules.sh が共通で使う定義。source して使う。

ADR_DIR=docs/adr
# ステータスの語彙(managing-adrs スキルの「ステータス」の表)
ADR_STATUS_VOCAB='提案中|採用|却下|非推奨|置換済み（ADR-[0-9]{4}）'
ADR_SUPERSEDED_RE='^置換済み（ADR-([0-9]{4})）$'

violations=0
report() {
  echo "NG: $1" >&2
  violations=$((violations + 1))
}

# コードフェンス(```)の外の行だけを出す。フェンスの中の見出しや箇条書きを数えないために使う。
adr_outside_fences() { awk '/^```/ { in_fence = !in_fence; next } !in_fence'; }

# 階層の語彙(managing-adrs スキルの「階層」の表)。上位から順に並べる
ADR_LEVELS=(システム アプリ レイヤ)
# 「決定」に必ず置く小見出し
ADR_DECISION_SECTIONS=(構成要素 依存の規則)
# ADR に書かないライブラリ・ツールの名前の一覧
# 絶対パスにする(source した側が cd しても読めるように)
ADR_BANNED_TERMS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/adr-banned-terms.txt"

# 先頭の箇条書きの値を出す(例: adr_field 階層)。見出しより前の行だけを見る
adr_field() { awk -v key="- $1: " '/^## / { exit } index($0, key) == 1 { print substr($0, length(key) + 1); exit }'; }
