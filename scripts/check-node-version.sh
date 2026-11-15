#!/usr/bin/env bash
# Node のメジャーバージョンが .nvmrc と一致するかを検査する(ADR-0006)。.nvmrc を基準とし、ずれたら .nvmrc に合わせる。
# 検査すること:
#   - 動いている Node のメジャーバージョン
#   - .devcontainer/devcontainer.json の Node の feature に version が書いてあれば、そのメジャーバージョン
# 使い方: scripts/check-node-version.sh [--warn]
#   --warn  ずれていても失敗せず、警告だけ出す(Dev container の起動時に使う)
set -euo pipefail

warn=false
case "${1:-}" in
  --warn) warn=true ;;
  "") ;;
  *)
    echo "使い方: $0 [--warn]" >&2
    exit 2
    ;;
esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FEATURE=ghcr.io/devcontainers/features/node:1

ng=0
report() {
  if $warn; then
    echo "node: 警告: $1" >&2
  else
    echo "NG: $1" >&2
  fi
  ng=1
}
# 26 / v26 / 26.13.1 のメジャーバージョンだけを取り出す
major() {
  local v="${1#v}"
  echo "${v%%.*}"
}

want="$(major "$(tr -d '[:space:]' <"$root/.nvmrc")")"
if ! [[ "$want" =~ ^[0-9]+$ ]]; then
  echo "NG: .nvmrc にメジャーバージョンの数字を書く(今は '$(cat "$root/.nvmrc")')" >&2
  exit 1
fi

have="$(major "$(node --version)")"
[ "$have" = "$want" ] \
  || report "Node $have が動いているが、.nvmrc は $want。.nvmrc に合わせる(Dev container は devcontainer.json の Node の feature に \"version\": \"$want\" を書いて作り直す)"

# feature の version が数字で書いてあるときだけ比べる(lts など、書いていないときは上の検査に任せる)
pinned="$(node -e '
  const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  console.log(((c.features || {})[process.argv[2]] || {}).version || "");
' "$root/.devcontainer/devcontainer.json" "$FEATURE")"
if [[ "$pinned" =~ ^v?[0-9] ]] && [ "$(major "$pinned")" != "$want" ]; then
  report "devcontainer.json の Node の feature は version $pinned だが、.nvmrc は $want。.nvmrc に合わせる"
fi

if [ "$ng" -eq 0 ]; then
  $warn && echo "node: Node $have は .nvmrc と一致している。"
  exit 0
fi
$warn && exit 0
exit 1
