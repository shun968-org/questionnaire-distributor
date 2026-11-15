# 試用版を外部の人に見せる

使い心地を見てもらうための、DB を使わない試用版の配り方。データはメモリ上だけにあり、止める(または、しばらく使われずに休止する)と、
サンプルだけの状態に戻る。見る人は全員が同じデータを触る。

データの置き場は、テスト用のメモリ上の実装(`apps/api/src/testing/memory-uow.ts`)で、本番の DB の代わりにはならない。
トランザクションを再現しないので、複数の書き込みの途中で失敗すると、途中までの状態が残る。使い心地を見る以外の目的には使わない。

- 配るのは `Dockerfile` で作るイメージ 1 つ。管理画面と API が 1 つのポートで動く。
- `TRIAL_PASSWORD` を設定すると、開いたときにユーザー名(既定 `trial`、`TRIAL_USER` で変えられる)とパスワードを尋ねる。
  URL と合言葉を伝えた人だけが使える。**外部に置くときは、必ず設定する**(アプリ自体には、まだログインがない)。
  配布するイメージは、`TRIAL_PASSWORD` がないと起動しない。
- PRO-CTCAE 日本語版の PDF は配らない(`.dockerignore` で `docs/` を除いている)。PDF から書き出したマスタのデータファイル
  (`apps/api/data/pro-ctcae-master.json`。git では管理しない)だけを同梱する。

## 1. データファイルを用意する

```sh
pnpm --filter api pro-ctcae:export   # PDF から apps/api/data/pro-ctcae-master.json を書き出す
```

書き出した後は、PDF がなくても、試用版の起動・`db:seed`・`db:import-pro-ctcae` はデータファイルを使う。

## 2. 手元で確かめる

```sh
pnpm --filter web build
TRIAL_PASSWORD=<合言葉> pnpm --filter api start:memory   # http://localhost:3000
```

## 3. 配備する

どちらも、作業はホスト(Dev container の外)で行う。Dev container は外向きの通信を絞っているので、中からは配備できない。
無料枠の条件は変わるので、始める前に各サービスの案内で確かめる。インスタンスは 1 つにする(複数あると、インスタンスごとにデータが分かれる)。

### 案 A(勧める): 支払い方法を登録しないサービスに、イメージを載せる(Render など)

支払い方法を登録していなければ、請求されることがない。無料の枠を超えたり、大量のアクセスを受けたりしても、サービスが止まるだけで済む。
使われていないと休止し、次に開いたときの起動に 1 分ほどかかることがある。

Render に、GitHub のコンテナレジストリ(GHCR)の非公開イメージを載せる手順。画面の項目名は変わることがある。

1. **GitHub でトークンを 2 つ作る**(Settings → Developer settings → Personal access tokens → Tokens (classic))。
   期限は短くする。Dev container の `.env` の `GH_TOKEN` とは別に作り、`.env` には書かない。
   - 送信用: `write:packages`(ホストから push するのに使う)
   - 読み取り用: `read:packages` だけ(Render に登録する)

   `scripts/trial-ghcr-tokens.sh` をホストで実行すると、作成画面を入力済みで開く URL を出し、貼り付けたトークンの権限を確かめ、
   送信用で `docker login` し、読み取り用をクリップボードに入れる。
2. **ホストでイメージを作って送る**。

   ```sh
   scripts/trial-push-image.sh <GitHub のユーザー名>
   ```

   データファイルがあることを確かめ、`linux/amd64`(Render は x86 で動く。Apple シリコンの Mac でも同じ)でイメージを作り、
   イメージに PDF・zip・`.env` が入っていないことを確かめてから、`ghcr.io/<ユーザー名(小文字)>/questionnaire-trial:latest` に送る。
   送った後、GitHub の自分のページの Packages で、`questionnaire-trial` が Private であることを確かめる(初めて送ったものは非公開になる)。
3. **Render に登録する**(GitHub のアカウントで登録できる)。支払い方法を求められないことを確かめる。求められたら、登録せずにやめる。
4. **Web サービスを作る**: New → Web Service → 「Existing Image」(既存のイメージから作る)を選ぶ。
   - Image URL: `ghcr.io/<GitHub のユーザー名(小文字)>/questionnaire-trial:latest`
   - Credential(レジストリの資格情報)を追加する: 種類は GitHub、ユーザー名は GitHub のユーザー名、トークンは読み取り用のもの
   - Region: Singapore(日本から近い)
   - Instance Type: **Free**
   - Environment Variables: `TRIAL_PASSWORD` = 合言葉(推測されにくい、長めのもの)
5. **開いて確かめる**: 作成が終わると `https://<名前>.onrender.com` の URL が出る。開いて、ユーザー名 `trial` と合言葉で入れること、
   「治療計画」にサンプルが出ることを確かめる。別のブラウザ(またはシークレットウィンドウ)で、合言葉なしでは入れないことも確かめる。

作り直したとき: 2 のスクリプトをやり直し、Render のサービスの画面で Manual Deploy を実行する。

### 案 B: Cloud Run(ソースから配備)

Google Cloud のプロジェクトと、支払い方法の登録が要る。使われていない間は止まり、開くと数秒で起動する。

**無料枠を超えたら自動で止まる仕組みは、既定ではない。** 予算のアラートは通知するだけで、止めない。大量のアクセスを受けると、
無料枠を超えた分が請求される。`--max-instances 1` で上限は抑えられるが、0 にはならない。請求を確実に避けたいなら、案 A を使う。

```sh
gcloud run deploy questionnaire-trial --source . --region asia-northeast1 \
  --allow-unauthenticated --max-instances 1 --memory 512Mi \
  --set-env-vars TRIAL_PASSWORD=<合言葉>
```

`--allow-unauthenticated` は Google 側の認証を外すだけで、合言葉(Basic 認証)はアプリが尋ねる。
送るファイルは `.gcloudignore` で決めている(`.gitignore` と違い、データファイルを送る)。

## 4. 見る人に伝えること

- URL、ユーザー名(`trial`)、合言葉
- PC のブラウザで開く(配信スケジュールはマウスで操作する)
- データは試用のもので、何を操作してもよい。保存はされず、しばらくすると最初の状態に戻る

## 終わったら

サービスを削除する(Render: サービスの Settings の一番下。Cloud Run: `gcloud run services delete questionnaire-trial --region asia-northeast1`)。
GHCR のイメージ(GitHub の Packages)を削除し、作ったトークンを 2 つとも無効にする。
ホストで `docker logout ghcr.io` を実行し、docker が保存した送信用のトークンを消す(資格情報の置き場が未設定だと、`~/.docker/config.json` に残る)。合言葉は使い回さない。
