# questionnaire-distributor

## 開発ツール

### AWS 構成図の生成 (diagram-as-code)

AWS に環境構築する際の構成図は [awslabs/diagram-as-code](https://github.com/awslabs/diagram-as-code)（`awsdac`）で YAML から PNG を生成する。
Claude Code の skill から呼び出して使う想定。

#### インストール

GitHub Releases のビルド済みバイナリを `~/.local/bin` に置く（Go のインストールは不要）。
以下は Linux x86_64 の例。ほかの環境は `linux-arm64` / `darwin-arm64` などにアセット名を読み替える（macOS は `brew install awsdac` も可）。

```sh
VERSION=v0.24
ARCH=linux-amd64
WORK="$(mktemp -d)"

gh release download "$VERSION" -R awslabs/diagram-as-code -D "$WORK" \
  -p "awsdac-${VERSION}_${ARCH}.zip" \
  -p "awsdac-mcp-server-${VERSION}_${ARCH}.zip"

# GitHub が公開している sha256 と照合する（OK と出ること）
gh api "repos/awslabs/diagram-as-code/releases/tags/$VERSION" \
  -q ".assets[] | select(.name | test(\"_${ARCH}.zip\$\")) | \"\(.digest | sub(\"sha256:\"; \"\"))  $WORK/\(.name)\"" \
  | sha256sum -c -

unzip -oq "$WORK/awsdac-${VERSION}_${ARCH}.zip" -d "$WORK"
unzip -oq "$WORK/awsdac-mcp-server-${VERSION}_${ARCH}.zip" -d "$WORK"
mkdir -p ~/.local/bin
install -m 755 \
  "$WORK/dist/awsdac-${VERSION}_${ARCH}/awsdac" \
  "$WORK/dist/awsdac-mcp-server-${VERSION}_${ARCH}/awsdac-mcp-server" \
  ~/.local/bin/
rm -rf "$WORK"
```

- `awsdac`: CLI 本体
- `awsdac-mcp-server`: MCP サーバ版（skill からは CLI を使う想定。MCP 連携が必要になった時点で設定する）

`~/.local/bin` が `PATH` に入っていない場合は追加する。

#### 動作確認

```sh
awsdac --version   # => awsdac version v0.24
awsdac https://raw.githubusercontent.com/awslabs/diagram-as-code/main/examples/alb-ec2.yaml -o /tmp/alb-ec2.png
```

`[Completed] AWS infrastructure diagram generated: ...` と表示され、PNG ができれば成功。

#### 実行時の通信先

`awsdac` は描画時に次の 2 か所からダウンロードする（取得したアイコンは `~/.cache/awsdac` にキャッシュされる）。

| 用途 | 通信先 |
| --- | --- |
| 定義ファイル（YAML の `DefinitionFiles` に `Type: URL` を指定した場合） | `raw.githubusercontent.com` |
| AWS アーキテクチャアイコン一式（定義ファイル内で参照） | `d1.awsstatic.com` |

devcontainer のファイアウォール（`.devcontainer/init-firewall.sh`）は現状 `d1.awsstatic.com` を許可していないため、
コンテナ内で使うには許可リストへの追加が必要（未対応）。

#### 注意

- `--embed-yaml` は入力 YAML（コメント含む）を PNG のメタデータに埋め込む。秘匿情報を含む YAML では使わない。
