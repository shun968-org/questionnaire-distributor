#!/usr/bin/env bash
# docs/adr/ の ADR が managing-adrs スキルの運用規則に沿っているかを検査する(書式は check-adr-format.sh)。
# 使い方:
#   scripts/check-adr-rules.sh --staged        staged の内容を比較元と比べる(pre-commit 用)
#   scripts/check-adr-rules.sh [--base REF]    作業ツリーの内容を比較元と比べる
# 比較元の既定は main との分岐点。main に入った 採用・非推奨・置換済み の ADR を採用済みとして扱い、
# ブランチで書いている途中の ADR(PR のレビュー指摘の反映など)は自由に直せる。
# 採用済み ADR のタイトル・「コンテキスト」「決定」・「結果」の既存の行の誤字・リンクだけを直すときは、
# ADR_ALLOW_ADOPTED_EDIT=1 を付けて実行する。
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib/adr.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/adr.sh"

RESULT_ITEMS=(良い面 受け入れた不利益 未解決の保留事項 移行作業)

staged=false
base=
base_given=false
while [ $# -gt 0 ]; do
  case "$1" in
    --staged) staged=true ;;
    --base)
      base="${2:?--base には比較元の ref を指定する}"
      base_given=true
      shift
      ;;
    *)
      echo "使い方: $0 [--staged] [--base REF]" >&2
      exit 2
      ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel)"

if ! $base_given; then
  for main_ref in origin/main main; do
    if git rev-parse -q --verify "$main_ref^{commit}" >/dev/null; then
      base="$(git merge-base HEAD "$main_ref" 2>/dev/null)" && break
    fi
  done
  : "${base:=HEAD}"
fi
base_label="$base"
$base_given || base_label="比較元 $(git rev-parse --short "$base" 2>/dev/null || echo "$base")"

# 番号で始まる ADR だけを扱う(番号の無いファイル名は check-adr-format.sh が検出する)
is_adr() { [[ "$1" =~ ^$ADR_DIR/[0-9]{4}-[^/]+\.md$ ]]; }
number_of() { basename "$1" | cut -c1-4; }

list_current() {
  if $staged; then
    git ls-files -- "$ADR_DIR/"
  else
    find "$ADR_DIR" -maxdepth 1 -type f -name '*.md' 2>/dev/null
  fi | while IFS= read -r f; do is_adr "$f" && echo "$f"; done | sort
}
current_content() {
  if $staged; then git show ":$1"; else cat "$1"; fi
}

status_of() { sed -n 's/^- ステータス: //p' | head -1; }
# 採用を経たステータスの順(採用 → 非推奨 → 置換済み)。提案中・却下は空
status_rank() {
  case "$1" in
    採用) echo 1 ;;
    非推奨) echo 2 ;;
    *) if [[ "$1" =~ $ADR_SUPERSEDED_RE ]]; then echo 3; fi ;;
  esac
}
# 見出しはコードフェンスの外のものだけを区切りとして扱う
# 採用後に書き換えてはいけない部分(1 行目のタイトルから「結果」の直前まで)。
# 冒頭のステータス(別の規則で検査する)と関連(後続の ADR を書き足す)の行は除く。
immutable_part() {
  awk '/^```/ { in_fence = !in_fence }
    !in_fence && /^## 結果$/ { exit }
    !in_fence && /^## / { in_body = 1 }
    !in_body && /^- (ステータス|関連):/ { next }
    { print }'
}
result_part() {
  awk '/^```/ { in_fence = !in_fence }
    !in_fence && /^## 結果$/ { p = 1; next }
    p'
}

mapfile -t current < <(list_current)

declare -A file_of=()   # 番号 -> ファイル
declare -A body_by=()   # ファイル -> 内容
declare -A status_by=() # ファイル -> ステータス

# --- 作業ツリー(または staged)の ADR だけで判断できる規則 ---
for f in "${current[@]}"; do
  n="$(number_of "$f")"
  body="$(current_content "$f")"
  body_by[$f]="$body"
  status_by[$f]="$(status_of <<<"$body")"

  title_n="$(head -1 <<<"$body" | sed -nE 's/^# ADR-([0-9]{4}): .*/\1/p')"
  [ -z "$title_n" ] || [ "$title_n" = "$n" ] \
    || report "$f: 1行目の番号 ADR-$title_n がファイル名の番号 $n と一致しない"

  if [ -n "${file_of[$n]:-}" ]; then
    report "$f: 番号 $n が ${file_of[$n]} と重複している"
  else
    file_of[$n]="$f"
  fi

  results="$(result_part <<<"$body")"
  for item in "${RESULT_ITEMS[@]}"; do
    adr_outside_fences <<<"$results" | grep -qE "^- ${item}:" \
      || report "$f: 「結果」に '- ${item}:' が無い(該当が無ければ 'なし。' と書く)"
  done
done

for f in "${current[@]}"; do
  [[ "${status_by[$f]}" =~ $ADR_SUPERSEDED_RE ]] || continue
  n="$(number_of "$f")"
  target="${BASH_REMATCH[1]}"
  if [ -z "${file_of[$target]:-}" ]; then
    report "$f: 置換先の ADR-$target が $ADR_DIR/ に無い"
  elif ((10#$target <= 10#$n)); then
    report "$f: 置換先の ADR-$target は、この ADR より後の番号にする"
  fi
done

# --- 比較元と比べて判断する規則 ---
if ! git rev-parse -q --verify "$base^{commit}" >/dev/null; then
  if $base_given; then
    echo "比較元 '$base' が見つからない" >&2
    exit 2
  fi
  # 最初のコミットなど、比較元が無いときは比べない
  [ "$violations" -eq 0 ]
  exit
fi

# 採用済み ADR の書き換えを報告する。誤字・リンクの修正だけなら ADR_ALLOW_ADOPTED_EDIT=1 で通す
adopted_edit() {
  if [ "${ADR_ALLOW_ADOPTED_EDIT:-}" = 1 ]; then
    echo "注意: $1: 採用済み ADR の書き換え($2)を、ADR_ALLOW_ADOPTED_EDIT=1 で通した" >&2
  else
    report "$1: 採用済み ADR の$2(誤字・リンクの修正だけなら ADR_ALLOW_ADOPTED_EDIT=1 を付けて実行する)"
  fi
}

mapfile -t before < <(git ls-tree --name-only "$base" -- "$ADR_DIR/" \
  | while IFS= read -r f; do is_adr "$f" && echo "$f"; done)

declare -A in_current=()
for f in "${current[@]}"; do in_current[$f]=1; done
declare -A in_before=()
max=0

for f in "${before[@]}"; do
  in_before[$f]=1
  n="$(number_of "$f")"
  ((10#$n > max)) && max=$((10#$n))

  if [ -z "${in_current[$f]:-}" ]; then
    report "$f: ADR は削除・改名しない。不要になった決定はステータスを変える"
    continue
  fi

  # 採用を経た ADR(採用・非推奨・置換済み)を守る。提案中・却下は書き換えてよい
  old="$(git show "$base:$f")"
  old_status="$(status_of <<<"$old")"
  old_rank="$(status_rank "$old_status")"
  [ -n "$old_rank" ] || continue

  new_status="${status_by[$f]}"
  new_rank="$(status_rank "$new_status")"
  if [ "$new_status" != "$old_status" ] && { [ -z "$new_rank" ] || ((new_rank <= old_rank)); }; then
    report "$f: ステータスを '$old_status' から '$new_status' には変えられない(採用 → 非推奨 → 置換済み（ADR-XXXX） の向きにだけ進める)"
  fi

  new="${body_by[$f]}"
  if [ "$(immutable_part <<<"$old")" != "$(immutable_part <<<"$new")" ]; then
    adopted_edit "$f" "タイトル・日付・「コンテキスト」「決定」は書き換えない。決定が変わったなら新しい ADR を起こす"
  fi
  # 「結果」は末尾への追記だけを認める
  old_result="$(result_part <<<"$old")"
  new_result="$(result_part <<<"$new")"
  if [ "$new_result" != "$old_result" ] && [[ "$new_result" != "$old_result"$'\n'* ]]; then
    adopted_edit "$f" "「結果」は末尾に追記するだけにし、既存の行を消したり書き換えたりしない"
  fi
done

for f in "${current[@]}"; do
  [ -n "${in_before[$f]:-}" ] && continue
  n="$(number_of "$f")"
  ((10#$n > max)) \
    || report "$f: 新しい ADR の番号は、$base_label にある最大の番号 $(printf '%04d' "$max") より大きくする(欠番は再利用しない)"
done

[ "$violations" -eq 0 ]
