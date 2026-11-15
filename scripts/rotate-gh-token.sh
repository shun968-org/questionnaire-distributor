#!/usr/bin/env bash
# .env の GH_TOKEN を新しい fine-grained token に入れ替え、古いトークンを無効にする。
# トークンを画面やログに出さないため、AI エージェントではなく自分のターミナルで実行する(task rotate-gh-token)。
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
env_file="$root/.env"
api=https://api.github.com

# origin の URL から owner/repo を取る
remote=$(git -C "$root" remote get-url origin)
slug=${remote#*github.com[:/]}
slug=${slug%.git}
owner=${slug%%/*}
repo=${slug#*/}

# 古いトークン(.env がなければ空)。CRLF の改行と前後の引用符は取り除く
old=""
if [ -f "$env_file" ]; then
  old=$(sed -n 's/^GH_TOKEN=//p' "$env_file" | head -n 1 | tr -d '\r')
  old=${old#[\"\']}
  old=${old%[\"\']}
fi

# 1. 作成画面を事前入力した URL を出す(リポジトリの選択だけは画面で行う)
# 名前は重複できない(上限 40 文字)ので、同じ日に何度実行しても重ならないよう時刻まで入れる
name="${repo:0:26}-$(date +%Y%m%d-%H%M)"
cat <<EOF
1. 次の URL を開き、Generate token を押す前に Repository access を変える。
   既定の「All repositories」ではなく「Only select repositories」→ $repo を選ぶ(URL では指定できない)。
   (組織 $owner・期限 90 日・Contents / Issues / Pull requests の書き込みは入力済み)

   https://github.com/settings/personal-access-tokens/new?name=$name&description=Dev+container+for+$repo&target_name=$owner&expires_in=90&contents=write&issues=write&pull_requests=write

EOF

# 2. 新しいトークンを受け取る(画面に出さない)
read -rsp "2. 作成したトークンを貼り付けて Enter: " new
echo
case "$new" in
  github_pat_*) ;;
  *) echo "fine-grained token(github_pat_ で始まる)ではない。中止する。" >&2; exit 1 ;;
esac

# 3. 新しいトークンでこのリポジトリと issue が読めるかを確かめる(トークンはコマンドラインに載せない)
# 接続できなかったときは 000 を返す(set -e で黙って終わらないように)
check() {
  curl -sS -o /dev/null -w '%{http_code}' \
    -H @<(printf 'Authorization: Bearer %s\n' "$new") \
    -H 'Accept: application/vnd.github+json' "$api$1" || true
}
for path in "/repos/$owner/$repo" "/repos/$owner/$repo/issues?per_page=1"; do
  code=$(check "$path")
  if [ "$code" != 200 ]; then
    echo "新しいトークンで $path が読めない(HTTP $code)。リポジトリの選択と権限を確認する。中止する。" >&2
    exit 1
  fi
done
# トークンの対象がこのリポジトリだけかを確かめる。公開リポジトリは対象外でも読めるので、
# 対象のリポジトリでしか読めない協力者の一覧(対象外は 403)で判定する
code=$(check "/repos/$owner/$repo/collaborators?per_page=1")
if [ "$code" != 200 ]; then
  echo "新しいトークンの対象に $owner/$repo が入っていない(HTTP $code)。Resource owner とリポジトリの選択を確認する。中止する。" >&2
  exit 1
fi
# 一覧は新しいトークンで取る(認証なしでは非公開のリポジトリが見えず、検査から漏れる)
if ! list=$(curl -fsS -H @<(printf 'Authorization: Bearer %s\n' "$new") \
      -H 'Accept: application/vnd.github+json' "$api/orgs/$owner/repos?per_page=100") \
    || ! names=$(jq -er 'if type == "array" then .[].name else error("not a list") end' <<< "$list"); then
  echo "組織 $owner のリポジトリの一覧を取れず、対象の範囲を確かめられない。.env は変えずに中止する。" >&2
  exit 1
fi
others=()
for other in $names; do
  [ "$other" = "$repo" ] && continue
  if [ "$(check "/repos/$owner/$other/collaborators?per_page=1")" = 200 ]; then others+=("$other"); fi
done
if [ ${#others[@]} -gt 0 ]; then
  echo "新しいトークンが $repo 以外も対象にしている: ${others[*]}。.env は変えずに中止する。" >&2
  echo "GitHub でトークンを Edit し、Repository access を Only select repositories → $repo にしてから、もう一度実行する。" >&2
  exit 1
fi
echo "3. 新しいトークンで $owner/$repo が読め、対象がこのリポジトリだけであることを確かめた。"

# 4. .env の GH_TOKEN だけを置き換える(他の行と権限はそのまま)
touch "$env_file"
tmp=$(mktemp "$env_file.XXXXXX")
trap 'rm -f "$tmp"' EXIT
chmod --reference="$env_file" "$tmp"
NEW_TOKEN=$new awk '
  /^GH_TOKEN=/ { if (!done) print "GH_TOKEN=" ENVIRON["NEW_TOKEN"]; done = 1; next }
  { print }
  END { if (!done) print "GH_TOKEN=" ENVIRON["NEW_TOKEN"] }
' "$env_file" > "$tmp"
mv "$tmp" "$env_file"
echo "4. .env の GH_TOKEN を置き換えた。"

# 5. 古いトークンを無効にする(認証なしで値を送る API。取り消せない)
if [ -n "$old" ] && [ "$old" != "$new" ]; then
  code=$(jq -n --arg t "$old" '{credentials: [$t]}' | curl -sS -o /dev/null -w '%{http_code}' \
    -X POST -H 'Accept: application/vnd.github+json' --data-binary @- "$api/credentials/revoke") || code=000
  if [ "$code" = 202 ]; then
    echo "5. 古いトークンの無効化を依頼した(受け付け済み。完了すると GitHub から通知が届く)。"
  else
    echo "5. 古いトークンの無効化に失敗した(HTTP $code)。https://github.com/settings/personal-access-tokens で削除する。" >&2
  fi
else
  echo "5. .env に古いトークンがない(または新しいトークンと同じ)ので、無効化は省いた。"
fi

# 6. gh のログインを新しいトークンに切り替える(コンテナ内で実行したとき)
if [ -f "$root/.devcontainer/setup-gh.sh" ] && [ -f /.dockerenv ]; then
  bash "$root/.devcontainer/setup-gh.sh"
  echo "6. gh と git の push は新しいトークンに切り替わった(作り直しは要らない)。"
else
  echo "6. コンテナの外で実行したので、コンテナを再起動すると新しいトークンに切り替わる。"
fi
