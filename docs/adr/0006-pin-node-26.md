# ADR-0006: Node のバージョンを 26 に固定し、.nvmrc を唯一の基準にする

- ステータス: 非推奨
- 日付: 2026-11-15
- 関連: ADR-0001、ADR-0005

## コンテキスト

ADR-0001 で API を Node 上で動かすと決め、ADR-0005 で Node のバージョンと固定する方法を `apps/` を作るときに決めることにした。

働いている力:

- 2026-11-15 時点の Node のサポート状況(nodejs/Release の `schedule.json`): 26 は Active LTS(2026-10-28 から、サポート終了 2029-04-30)、24 は Maintenance(サポート終了 2028-04-30)、27 は 2027-04 のリリース予定。
- Dev container の Node は devcontainer feature(`ghcr.io/devcontainers/features/node:1`)の既定 `lts` で入れており、今は 26.13.1。次の LTS が出ると、コンテナを作り直したときに黙って上がる。Node のバージョンは nvm で管理されている。
- Node の取得先 `nodejs.org` はファイアウォールで許可していない。
- pnpm 12 の `engineStrict: true` は、ルートの `engines.node` だけでなく依存パッケージの `engines` にも適用される。依存が `engines.node` に Node 26 を含まない範囲を書いているだけで、install が `ERR_PNPM_UNSUPPORTED_ENGINE` で止まる。`engineStrict` が無いと、ルートの `engines.node` に合わなくても警告だけで通る。
- ルートの `package.json` の `preinstall` は、依存のスクリプトと違い許可なしで pnpm が実行し、失敗すると install が止まる。

### 検討した選択肢

| 案 | 却下理由 |
|---|---|
| Node 24 | 既に Maintenance で、サポート終了が 26 より 1 年早い。Dev container の Node と食い違う |
| パッチまで固定する(例: `26.13.1`) | Dev container と CI の両方を、パッチが出るたびに更新する手間がかかり、セキュリティ修正の取り込みが遅れる |
| `engines.node` と pnpm の `engineStrict` で止める | 依存パッケージの `engines` にも適用され、こちらで制御できない理由で install が止まる |
| `.node-version` を基準にする | Dev container の nvm が読まない |
| pnpm に Node を入れさせる(`devEngines.runtime` など) | 取得先の `nodejs.org` を、ファイアウォールの許可に足す必要がある。Node の入れ方が Dev container の feature と 2 系統になる |

## 決定

**Node はメジャーバージョン 26 に固定し、ルートの `.nvmrc` を唯一の基準にする。install のたびに、動いている Node のメジャーバージョンが `.nvmrc` と一致するかを検査する。**

判断の根拠:

1. **サポートが一番長い。** 26 は Active LTS で、2029-04-30 までサポートされる。
2. **今の環境のまま使える。** Dev container に入っている Node と同じで、取得先の追加も要らない。
3. **食い違いを install の時点で止められる。** ルートの `preinstall` で `.nvmrc` と比べるので、違うメジャーバージョンでの install が失敗する。依存パッケージの `engines` には左右されない。

### 規則

| 対象 | 必須 | 禁止 |
|---|---|---|
| 基準 | ルートの `.nvmrc` に `26` と書く。ほかとずれたら `.nvmrc` を優先し、ほかを `.nvmrc` に合わせる | `.nvmrc` 以外のファイルに Node のバージョンを書く(`engines.node` を含む。下の Dev container の例外を除く) |
| Dev container | Node の feature は既定(`lts`)のままにする。検査でずれが出たら、そのときに feature の `version` を `.nvmrc` に合わせる。起動時(`postStartCommand`)に `scripts/check-node-version.sh --warn` を実行する | feature の `version` に `.nvmrc` と違うバージョンを書く |
| CI | `actions/setup-node` の `node-version-file: .nvmrc` で入れる | ワークフローに Node のバージョンを直接書く |
| 検査 | `scripts/check-node-version.sh` で、動いている Node と `devcontainer.json` の feature の `version`(書いてあれば)のメジャーバージョンを `.nvmrc` と比べる。ルートの `package.json` の `preinstall` から実行し、ずれていれば install を失敗させる | `preinstall` の検査を外す。`engines.node` と `engineStrict` で代用する |

## 結果

- 良い面: Node のバージョンの基準が `.nvmrc` だけになり、Dev container や CI の Node とずれると、コンテナの起動時に警告が出て、install が止まる。依存パッケージの `engines` に左右されない。2029-04 までバージョンを上げる必要がない。
- 受け入れた不利益: Dev container の Node は feature の既定(`lts`)に従うので、次の LTS(28)が出たあとにコンテナを作り直すと、install が検査で止まる。そのときに feature の `version` を書いて合わせる(`devcontainer.json` は `.nvmrc` を読めない)。パッチバージョンは環境ごとに異なりうる。
- 未解決の保留事項: 次の LTS(28)へ上げる時期は、26 のサポート終了(2029-04-30)より前に、新しい ADR で決める。
- 移行作業:
  - ルートの `package.json` の `preinstall` から `scripts/check-node-version.sh` を実行する(ADR-0005 の移行作業と同時に行う)。`.nvmrc` とスクリプト、Dev container の起動時の検査は、この ADR と同時に用意した。
  - Node を使う CI のジョブで、`actions/setup-node` の `node-version-file: .nvmrc` を使う。
- 追記(2026-11-15): ADR にはアーキテクチャ(構造・レイヤ間の接続方法)に関係するものだけを定義することにした。この ADR は全体が Node のバージョンとその管理で、アーキテクチャに関係しないため非推奨にした。`.nvmrc` を基準にした Node のバージョンの管理と検査は、CONTRIBUTING に移した。
