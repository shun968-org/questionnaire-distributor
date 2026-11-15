#!/usr/bin/env bash
# ファイアウォールの適用後に、開発で使うホストへの疎通を確かめる(postStartCommand で init-firewall.sh の後に実行)。
# 許可リストに足りないドメインがあると、ここで失敗して起動時のログに出る。
set -uo pipefail

# ツールが実際に接続するホスト(許可リストのドメインではなく具体的なホストを書く)
REQUIRED_HOSTS=(
  api.anthropic.com
  statsig.com
  sentry.io
  claude.ai
  platform.claude.com
  github.com
  api.github.com
  raw.githubusercontent.com
  registry.npmjs.org
  api.notion.com
  marketplace.visualstudio.com
  vscode.blob.core.windows.net
  update.code.visualstudio.com
)

# 許可していない宛先(届いたらファイアウォールが効いていない)
# example.com は dnsmasq の名前解決で、1.1.1.1(IP の直接指定)は iptables で止まることを確かめる
BLOCKED_HOSTS=(
  example.com
  1.1.1.1
)

results=$(mktemp -d)
trap 'rm -rf "$results"' EXIT

# HTTP の応答があれば疎通とみなす(ステータスコードは問わない)
probe() {
  curl -sS -o /dev/null --connect-timeout 5 --max-time 10 "https://$1" 2>&1
}

# 外部サービスの一時的な不調で起動エラーにしないよう、通らなければ 1 回だけ再試行する
for host in "${REQUIRED_HOSTS[@]}"; do
  ( if err=$(probe "$host") || { sleep 2; err=$(probe "$host"); }; then :; else
      echo "NG  $host が通らない: $err" > "$results/required-$host"; fi ) &
done
for host in "${BLOCKED_HOSTS[@]}"; do
  ( if probe "$host" > /dev/null; then echo "NG  $host に届く(ファイアウォールが効いていない)" > "$results/blocked-$host"; fi ) &
done
wait

failures=$(cat "$results"/* 2>/dev/null)
if [ -n "$failures" ]; then
  {
    echo "========================================================================"
    echo "疎通の検査に失敗した。.devcontainer/init-firewall.sh の許可リストを確認する。"
    echo "$failures"
    echo "========================================================================"
  } >&2
  exit 1
fi
echo "疎通の検査: OK(通る ${#REQUIRED_HOSTS[@]} 件、止まる ${#BLOCKED_HOSTS[@]} 件)"
