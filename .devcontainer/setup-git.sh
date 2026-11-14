#!/usr/bin/env bash
# .env の値から git と gh を設定する(ホストの認証情報は転送しない)。
set -euo pipefail

git config --global --add safe.directory /workspace
git -C /workspace config core.hooksPath .githooks
[ -z "${GIT_USER_NAME:-}" ] || git config --global user.name "$GIT_USER_NAME"
[ -z "${GIT_USER_EMAIL:-}" ] || git config --global user.email "$GIT_USER_EMAIL"
[ -z "${GH_TOKEN:-}" ] || gh auth setup-git
