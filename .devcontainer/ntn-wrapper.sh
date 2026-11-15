#!/usr/bin/env bash
# ntn のラッパー(イメージで ~/.local/bin/ntn に置く)。
# .env の NOTION_API_TOKEN を、この ntn の実行中だけ環境変数にする(コンテナの環境変数にすると起動ログに出るため)。
set -euo pipefail

if [ -z "${NOTION_API_TOKEN:-}" ]; then
  token=$(bash /workspace/.devcontainer/read-env.sh NOTION_API_TOKEN)
  if [ -n "$token" ]; then export NOTION_API_TOKEN=$token; fi
fi
exec "$HOME/.local/libexec/ntn" "$@"
