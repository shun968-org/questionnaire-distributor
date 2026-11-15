#!/usr/bin/env bash
# .env の GH_TOKEN で gh にログインし、git の push の認証にも使う(postStartCommand でファイアウォールの後に実行)。
# トークンは環境変数にせず、gh の設定ファイル(~/.config/gh/hosts.yml)に保存する。
set -euo pipefail

token=$(bash /workspace/.devcontainer/read-env.sh GH_TOKEN)
if [ -z "$token" ]; then
  echo "gh: .env に GH_TOKEN がないので、ログインを省いた。"
  exit 0
fi
printf '%s\n' "$token" | gh auth login --hostname github.com --git-protocol https --with-token --insecure-storage
gh auth setup-git
echo "gh: $(gh api user --jq .login) としてログインした。"
