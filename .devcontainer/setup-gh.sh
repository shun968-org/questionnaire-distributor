#!/usr/bin/env bash
# .env の GH_TOKEN で gh にログインし、git の push の認証にも使う(postStartCommand でファイアウォールの後に実行)。
# トークンは環境変数にせず、gh の設定ファイル(~/.config/gh/hosts.yml)に保存する。
set -euo pipefail

token=$(bash /workspace/.devcontainer/read-env.sh GH_TOKEN)
if [ -z "$token" ]; then
  echo "gh: .env に GH_TOKEN がないので、ログインを省いた。"
  exit 0
fi
# トークンの失効や GitHub に届かないときも、コンテナの起動は止めずに警告だけ出す。
if ! printf '%s\n' "$token" | gh auth login --hostname github.com --git-protocol https --with-token --insecure-storage; then
  echo "gh: 警告: ログインに失敗したので省いた。.env の GH_TOKEN と GitHub への接続を確認すること。" >&2
  exit 0
fi
if ! gh auth setup-git; then
  echo "gh: 警告: git の認証の設定に失敗した。git push は gh の認証を使えない。" >&2
fi
if login=$(gh api user --jq .login); then
  echo "gh: ${login} としてログインした。"
else
  echo "gh: 警告: ログインしたが、ユーザーを確認できなかった。トークンが失効しているかもしれない。" >&2
fi
