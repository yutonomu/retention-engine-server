# Retention Engine Server

[Nest](https://github.com/nestjs/nest) フレームワークを使用したサーバーサイドアプリケーションです。

## Docker 開発ワークフロー

`docker compose` を使って、ローカル環境を汚さずに開発できます。`npm` コマンドの代わりとして機能します。

### 1. 初回セットアップ / 依存関係の更新
`package.json` を変更した場合や初回起動時は、以下のコマンドで依存関係をインストール（`npm ci`）します。

```bash
docker compose build
```
※ ホスト側で `npm install` をする必要はありません。

### 2. サーバー起動（開発モード）
ホットリロード有効でサーバーを起動します（`npm run start:dev` 相当）。

```bash
docker compose up
```
- サーバーは `http://localhost:5001` でアクセス可能です。
- ソースコードの変更は即座に反映されます。
- バックグラウンド実行: `docker compose up -d`
- ログ確認: `docker compose logs -f server`

### 3. テスト実行
コンテナ内でテストを実行します。

```bash
# 単体テスト
docker compose run --rm server npm run test

# E2Eテスト
docker compose run --rm server npm run test:e2e
```

### 4. 本番用ビルド / Cloud Run
本番環境（Cloud Runなど）へのデプロイは、`Dockerfile` の `builder` および `runtime` ステージを使用します。
開発用の `docker-compose.yml` は `development` ステージをターゲットにしているため、本番ビルドには影響しません。

- **Cloud Run デプロイ例**:
  ```bash
  gcloud run deploy <SERVICE_NAME> --source . --region <REGION> --allow-unauthenticated --set-env-vars KEY=VALUE
  ```

- **.env.run を使用する場合**:
  `.env.run` ファイル（KEY=VALUE形式）に定義された環境変数を反映してデプロイするには、以下のコマンドを使用します。
  ```bash
  gcloud run deploy retention-engine-server \
    --source . \
    --region asia-northeast1 \
    --allow-unauthenticated \
    --set-env-vars "$(cat .env.run | grep -v '^#' | xargs | tr ' ' ',')"
  ```
  ※ 値にスペースやカンマが含まれる場合は、YAML形式のファイルを作成し `--env-vars-file` を使用することを推奨します。

- **環境変数**:
  - ローカル開発時は `.env` ファイルを使用してください。
  - 本番環境では Cloud Run の環境変数設定機能を使用してください。
