#!/usr/bin/env bash
# 試用版のイメージを作り、GitHub のコンテナレジストリ(GHCR)に送る(docs/trial-deploy.md の手順 2)。
# 先に scripts/trial-ghcr-tokens.sh で、docker を ghcr.io にログインさせておく。
# ホスト(Dev container の外)のターミナルで実行する。
# 使い方: scripts/trial-push-image.sh <GitHub のユーザー名> [タグ(既定 latest)]
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
data="$root/apps/api/data/pro-ctcae-master.json"

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "使い方: $0 <GitHub のユーザー名> [タグ(既定 latest)]" >&2
  exit 2
fi
if [ -f /.dockerenv ]; then
  echo "Dev container の中では実行しない(docker がなく、ghcr.io にも届かない)。ホストのターミナルで実行する。" >&2
  exit 1
fi
command -v docker >/dev/null || { echo "docker が要る。" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "docker が動いていない。Docker を起動する。" >&2; exit 1; }

# イメージの名前は小文字にする(GHCR は大文字を受け付けない)
owner=$(tr '[:upper:]' '[:lower:]' <<< "$1")
image="ghcr.io/$owner/questionnaire-trial:${2:-latest}"

# 1. PRO-CTCAE マスタのデータファイルがあること(ないと、質問票と治療計画の画面が動かない)
if [ ! -s "$data" ]; then
  echo "データファイルがない: $data" >&2
  echo "Dev container の中で pnpm --filter api pro-ctcae:export を実行して書き出す。" >&2
  exit 1
fi
echo "1. データファイルを確かめた。"

# 2. イメージを作る。Render は x86 で動くので、Apple シリコンの Mac でも linux/amd64 で作る
echo "2. イメージを作る: $image"
docker build --platform linux/amd64 -t "$image" "$root"

# 3. 配布してはいけないもの(参考の資料の PDF・zip、.env)が入っていないことを、作ったイメージの中で確かめる
#    依存のパッケージ(node_modules)が持つファイルは対象にしない
found=$(docker run --rm --platform linux/amd64 --entrypoint sh "$image" -c \
  "find /app \( -name node_modules -prune \) -o \( -type f \( -name '*.pdf' -o -name '*.zip' -o -name '.env' -o -name '.env.*' \) -print \); [ -e /app/docs ] && echo /app/docs; true")
if [ -n "$found" ]; then
  echo "イメージに、配布しないはずのものが入っている。送らずに中止する:" >&2
  echo "$found" >&2
  exit 1
fi
docker run --rm --platform linux/amd64 --entrypoint sh "$image" -c 'test -s /app/apps/api/data/pro-ctcae-master.json' \
  || { echo "イメージにデータファイルが入っていない。中止する。" >&2; exit 1; }
echo "3. イメージに PDF・zip・.env が入っていないことと、データファイルが入っていることを確かめた。"

# 4. 送る
if ! docker push "$image"; then
  echo "送れなかった。ghcr.io にログインしていないなら、scripts/trial-ghcr-tokens.sh を先に実行する。" >&2
  exit 1
fi

cat <<MSG

4. 送った: $image

   次に確かめること:
     https://github.com/$1?tab=packages で、questionnaire-trial が Private であること(公開になっていたら、Package settings で非公開にする)

   Render に入れる Image URL:
     $image
   すでに Render のサービスがあるなら、サービスの画面で Manual Deploy を実行する。
MSG
