#!/usr/bin/env bash
# 試用版のイメージを GitHub のコンテナレジストリ(GHCR)に置くための、トークンを 2 つ用意する(docs/trial-deploy.md の手順 1)。
#   - 送信用(write:packages): ホストの docker を ghcr.io にログインさせるのに使う。ファイルには保存しない
#   - 読み取り用(read:packages だけ): Render に登録する。画面に出さず、クリップボードに入れる
# トークン(classic)は API では作れないので、作成画面を事前入力した URL を出し、貼り付けたトークンの権限を確かめる。
# トークンを画面やログに出さないため、AI エージェントではなく、ホスト(Dev container の外)の自分のターミナルで実行する。
# 使い方: scripts/trial-ghcr-tokens.sh [--read-only]
#   --read-only  読み取り用のトークンだけを作り直す(なくしたとき。発行済みのトークンの値は、GitHub でも見直せない)
set -euo pipefail

api=https://api.github.com
image=questionnaire-trial

read_only=false
case "${1:-}" in
  --read-only) read_only=true ;;
  "") ;;
  *) echo "使い方: $0 [--read-only]" >&2; exit 2 ;;
esac

if [ -f /.dockerenv ]; then
  echo "Dev container の中では実行しない(ghcr.io に届かず、docker もない)。ホストのターミナルで実行する。" >&2
  exit 1
fi
command -v curl >/dev/null || { echo "curl が要る。" >&2; exit 1; }

# トークンで GitHub に問い合わせ、応答のヘッダと本文を返す(トークンはコマンドラインに載せない)
fetch_user() {
  curl -sS -i -H @<(printf 'Authorization: Bearer %s\n' "$1") -H 'Accept: application/vnd.github+json' "$api/user" || true
}

# 貼り付けたトークンを受け取り、権限(scope)を確かめる。結果は token・scopes・login に入れる
# $1: 説明、$2: 作成画面に入力済みにする scope
ask_token() {
  local label=$1 scope=$2 response
  cat <<MSG

$label
   次の URL を開く(名前と権限は入力済み)。Expiration を 7 days など短くして、Generate token を押す。

   https://github.com/settings/tokens/new?description=$image+$scope+$(date +%Y%m%d-%H%M)&scopes=$scope

MSG
  read -rsp "   作成したトークンを貼り付けて Enter: " token
  echo
  case "$token" in
    ghp_*) ;;
    *) echo "classic のトークン(ghp_ で始まる)ではない。中止する。" >&2; exit 1 ;;
  esac
  response=$(fetch_user "$token")
  if ! grep -qiE '^HTTP/[0-9.]+ 200' <<< "$response"; then
    echo "トークンで GitHub に入れない。貼り付けた値を確かめる。中止する。" >&2
    exit 1
  fi
  # 権限は、応答の x-oauth-scopes ヘッダに並ぶ(空白と改行を除く)
  # 一致しないと grep が失敗を返すので、|| true で受ける(set -e で黙って止まらず、下の検査で理由を出す)
  scopes=$(grep -i '^x-oauth-scopes:' <<< "$response" | head -n 1 | cut -d: -f2- | tr -d ' \r' || true)
  login=$(grep -o '"login": *"[^"]*"' <<< "$response" | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/' || true)
  [ -n "$login" ] || { echo "GitHub のユーザー名を読み取れない。中止する。" >&2; exit 1; }
}

# クリップボードに入れる(使えるコマンドがなければ失敗を返す)
to_clipboard() {
  if command -v pbcopy >/dev/null; then pbcopy
  elif command -v clip.exe >/dev/null; then clip.exe
  elif command -v wl-copy >/dev/null; then wl-copy
  elif command -v xclip >/dev/null; then xclip -selection clipboard
  else return 1
  fi
}

if ! $read_only; then
  # 1. 送信用のトークン
  ask_token "1. 送信用のトークン(ホストからイメージを送る)" write:packages
  case ",$scopes," in
    *,write:packages,*) ;;
    *) echo "write:packages の権限がない(今の権限: ${scopes:-なし})。中止する。" >&2; exit 1 ;;
  esac
  push_token=$token
  echo "   $login のトークンで、権限は ${scopes} であることを確かめた。"

  # 2. ホストの docker を ghcr.io にログインさせる(トークンは docker の資格情報の置き場に入る)
  if command -v docker >/dev/null; then
    printf '%s' "$push_token" | docker login ghcr.io -u "$login" --password-stdin >/dev/null
    echo "2. docker を ghcr.io にログインさせた。"
  else
    echo "2. docker が見つからないので、ログインは省いた。docker を入れてから、もう一度実行する。" >&2
  fi
  unset push_token token
fi

# 3. 読み取り用のトークン(Render に登録する)。読み取りより広い権限のものは受け付けない
ask_token "3. 読み取り用のトークン(Render に登録する)" read:packages
if [ "$scopes" != read:packages ]; then
  echo "権限が read:packages だけになっていない(今の権限: ${scopes:-なし})。外部のサービスに渡すので、読み取りだけにする。" >&2
  echo "GitHub でこのトークンを削除し、もう一度実行する: https://github.com/settings/tokens" >&2
  exit 1
fi
if printf '%s' "$token" | to_clipboard; then
  echo "   権限が read:packages だけであることを確かめ、クリップボードに入れた。Render の Credential のトークンの欄に貼り付ける。"
  echo "   貼り付けたら、ほかのものをコピーして、クリップボードから消す。"
else
  echo "   権限が read:packages だけであることを確かめた。クリップボードを使えないので、画面に出す。"
  read -rp "   まわりに見られていないことを確かめて Enter(出さないなら Ctrl+C): " _
  printf '   %s\n' "$token"
fi
unset token
owner=$(tr '[:upper:]' '[:lower:]' <<< "$login")

if $read_only; then
  cat <<MSG

   Render の Credential に登録する: 種類 GitHub / ユーザー名 $login / トークン(クリップボードの中身)
   前の読み取り用のトークンは、削除する: https://github.com/settings/tokens
MSG
  exit 0
fi

cat <<MSG

4. 続けて、イメージを作って送る。

   scripts/trial-push-image.sh $login

   Render に入れる値:
     Image URL  ghcr.io/$owner/$image:latest
     Credential 種類 GitHub / ユーザー名 $login / トークン(クリップボードの中身)

   終わったら、トークンを 2 つとも削除する: https://github.com/settings/tokens
   docker のログインを外す: docker logout ghcr.io
MSG
