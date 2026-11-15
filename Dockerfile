# 試用版のイメージ。DB を使わず、メモリ上のデータで動く(止めるとデータは消える)。
# 作る前に、PRO-CTCAE マスタのデータファイルを書き出しておく: pnpm --filter api pro-ctcae:export
# PRO-CTCAE 日本語版の PDF は入れない(.dockerignore で docs/ を除いている)。
# 1 段目: 依存を入れて、管理画面とサーバをビルドする(開発用の依存を含む。配るイメージには残さない)
FROM node:26-slim AS build

WORKDIR /app
RUN npm install -g pnpm@12.21.0

# 依存だけを先に入れる(ソースを変えても、この層は使い回せる)。install 時のスクリプトは要らない
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps ./apps
# データファイルがないと、質問票と治療計画の画面が動かないので、ここで止める
RUN test -s apps/api/data/pro-ctcae-master.json \
    || (echo "apps/api/data/pro-ctcae-master.json がない。pnpm --filter api pro-ctcae:export で書き出す" >&2; exit 1)
RUN pnpm --filter web build
# サーバは、起動を速くするため、1 つのファイルにまとめておく(小さいインスタンスでは、起動のたびに変換すると遅い)
RUN pnpm --filter api build:trial

# 2 段目: 配るイメージ。実行に要るもの(まとめたサーバ、管理画面のビルド結果、マスタのデータファイル)だけを入れる
FROM node:26-slim

WORKDIR /app
COPY --from=build /app/apps/api/dist/trial.mjs apps/api/dist/trial.mjs
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/apps/api/data/pro-ctcae-master.json apps/api/data/pro-ctcae-master.json

ENV NODE_ENV=production
ENV WEB_DIST=/app/apps/web/dist
ENV PRO_CTCAE_MASTER_FILE=/app/apps/api/data/pro-ctcae-master.json
ENV PORT=8080
EXPOSE 8080
# まとめたファイルを node で直接起動する(root 以外のユーザーで動かす)
USER node
CMD ["node", "apps/api/dist/trial.mjs"]
