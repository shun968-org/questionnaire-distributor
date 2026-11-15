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
