#!/usr/bin/env bash
# docs/adr/ の ADR が managing-adrs スキルの運用規則に沿っているかを検査する(書式は check-adr-format.sh)。
# 使い方:
#   scripts/check-adr-rules.sh --staged        staged の内容を比較元と比べる(pre-commit 用)
#   scripts/check-adr-rules.sh [--base REF]    作業ツリーの内容を比較元と比べる
# 比較元の既定は main との分岐点。main に入った ADR だけを採用済みとして扱い、
# ブランチで書いている途中の ADR(PR のレビュー指摘の反映など)は自由に直せる。
# 採用済み ADR の「コンテキスト」「決定」の誤字・リンクだけを直すときは、
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
# 見出しはコードフェンスの外のものだけを区切りとして扱う
# 採用後に書き換えてはいけない部分(「コンテキスト」から「結果」の直前まで)
immutable_part() {
  awk '/^```/ { in_fence = !in_fence }
    !in_fence && /^## 結果$/ { exit }
    !in_fence && /^## コンテキスト$/ { p = 1 }
    p'
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

  old="$(git show "$base:$f")"
  [ "$(status_of <<<"$old")" = 採用 ] || continue

  new_status="${status_by[$f]}"
  if [ "$new_status" != 採用 ] && [ "$new_status" != 非推奨 ] \
    && ! [[ "$new_status" =~ $ADR_SUPERSEDED_RE ]]; then
    report "$f: 採用済み ADR のステータスは 非推奨 か 置換済み（ADR-XXXX） にだけ変えられる(今は '$new_status')"
  fi

  new="${body_by[$f]}"
  if [ "$(immutable_part <<<"$old")" != "$(immutable_part <<<"$new")" ]; then
    if [ "${ADR_ALLOW_ADOPTED_EDIT:-}" = 1 ]; then
      echo "注意: $f: 採用済み ADR の「コンテキスト」「決定」の変更を、ADR_ALLOW_ADOPTED_EDIT=1 で通した" >&2
    else
      report "$f: 採用済み ADR の「コンテキスト」「決定」は書き換えない。決定が変わったなら新しい ADR を起こす(誤字・リンクの修正だけなら ADR_ALLOW_ADOPTED_EDIT=1 を付けて実行する)"
    fi
  fi
done

for f in "${current[@]}"; do
  [ -n "${in_before[$f]:-}" ] && continue
  n="$(number_of "$f")"
  ((10#$n > max)) \
    || report "$f: 新しい ADR の番号は、$base_label にある最大の番号 $(printf '%04d' "$max") より大きくする(欠番は再利用しない)"
done

[ "$violations" -eq 0 ]
