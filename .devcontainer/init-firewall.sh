#!/usr/bin/env bash
# 外向き通信を許可ドメインだけに絞る(コンテナ起動時に 1 回実行)。仕組みは docs/security-boundaries.md。
set -euo pipefail
IFS=$'\n\t'

ALLOWED_DOMAINS=(
  api.anthropic.com
  statsig.anthropic.com
  statsig.com
  sentry.io
  claude.ai
  claude.com
  github.com
  githubusercontent.com
  registry.npmjs.org
  api.notion.com
  marketplace.visualstudio.com
  vscode.blob.core.windows.net
  update.code.visualstudio.com
)

# 再起動後は resolv.conf を書き換え済みのことがあるので、初回に退避した内容を使う
[ -f /etc/resolv.conf.orig ] || cp /etc/resolv.conf /etc/resolv.conf.orig
upstreams=$(awk '/^nameserver/ {print $2}' /etc/resolv.conf.orig | grep -E '^[0-9.]+$')

# dnsmasq: 許可ドメインだけを上流に転送し、解決した IP を ipset に入れる
ipset create allowed-domains hash:ip
{
  echo "user=dnsmasq"
  echo "listen-address=127.0.0.1"
  echo "bind-interfaces"
  echo "no-resolv"
  echo "no-hosts"
  echo "address=/#/"
  # compose のサービス名(ドットなし)は Docker の内部 DNS に転送する
  if grep -qx '127.0.0.11' <<< "$upstreams"; then echo "server=//127.0.0.11"; fi
  for domain in "${ALLOWED_DOMAINS[@]}"; do
    for ns in $upstreams; do echo "server=/$domain/$ns"; done
    echo "ipset=/$domain/allowed-domains"
  done
} > /etc/dnsmasq-allowlist.conf
dnsmasq --conf-file=/etc/dnsmasq-allowlist.conf
echo "nameserver 127.0.0.1" > /etc/resolv.conf

# 上流の DNS に問い合わせられるのは dnsmasq だけ
for ns in $upstreams 127.0.0.11; do
  iptables -A OUTPUT -d "$ns" -m owner --uid-owner dnsmasq -j ACCEPT
  iptables -A OUTPUT -d "$ns" -j REJECT
done

iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# コンテナの Docker ネットワーク(compose の PostgreSQL など)
default_if=$(ip route | awk '/default/ {print $5; exit}')
container_network=$(ip -o -f inet addr show "$default_if" | awk '{print $4; exit}')
iptables -A INPUT -s "$container_network" -j ACCEPT
iptables -A OUTPUT -d "$container_network" -j ACCEPT

iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

ip6tables -P INPUT DROP
ip6tables -P FORWARD DROP
ip6tables -P OUTPUT DROP
