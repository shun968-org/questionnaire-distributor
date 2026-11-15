#!/usr/bin/env bash
# .env の値から git を設定する(ホストの認証情報は転送しない)。gh のログインは起動時の setup-gh.sh で行う。
set -euo pipefail

name=$(bash /workspace/.devcontainer/read-env.sh GIT_USER_NAME)
email=$(bash /workspace/.devcontainer/read-env.sh GIT_USER_EMAIL)
git config --global --add safe.directory /workspace
[ -z "$name" ] || git config --global user.name "$name"
[ -z "$email" ] || git config --global user.email "$email"
(cd /workspace && lefthook install)
