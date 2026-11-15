#!/usr/bin/env bash
# /workspace/.env から 1 つの値を取り出して出力する(source しない。.env がなければ空)。
# 秘密をコンテナの環境変数にすると Dev Containers の起動ログに出るので、使う時点でここから読む。
set -euo pipefail

file=/workspace/.env
[ -f "$file" ] || exit 0
value=$(sed -n "s/^$1=//p" "$file" | tail -n 1 | tr -d '\r')
value=${value#[\"\']}
value=${value%[\"\']}
printf '%s' "$value"
