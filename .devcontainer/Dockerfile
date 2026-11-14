FROM mcr.microsoft.com/devcontainers/base:debian

RUN apt-get update && apt-get install -y --no-install-recommends \
        neovim jq shellcheck iptables ipset iproute2 dnsutils dnsmasq-base \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

COPY managed-settings.json /etc/claude-code/managed-settings.json

# vscode の sudo はファイアウォールの設定だけに絞る(外せないようにする)
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod 755 /usr/local/bin/init-firewall.sh \
    && rm -f /etc/sudoers.d/vscode \
    && echo "vscode ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/vscode-firewall \
    && chmod 0440 /etc/sudoers.d/vscode-firewall

ARG TASK_VERSION=3.54.0
RUN deb="task_${TASK_VERSION}_linux_$(dpkg --print-architecture).deb" \
    && base="https://github.com/go-task/task/releases/download/v${TASK_VERSION}" \
    && cd /tmp && curl -fsSLO "$base/$deb" \
    && curl -fsSL "$base/task_checksums.txt" | grep " $deb\$" | sha256sum -c \
    && dpkg -i "$deb" && rm "$deb"

RUN mkdir -p /home/vscode/.claude && chown vscode:vscode /home/vscode/.claude
USER vscode

RUN curl -fsSL https://claude.ai/install.sh | bash
RUN curl -fsSL https://ntn.dev | bash

WORKDIR /workspace
