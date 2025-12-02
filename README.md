# Retention Engine Server

[Nest](https://github.com/nestjs/nest) フレームワークを使用したサーバーサイドアプリケーションです。

## セットアップ

```bash
$ npm install
```

## 実行方法

```bash
# 開発モード
$ npm run start

# ウォッチモード（開発時推奨）
$ npm run start:dev

# 本番モード
$ npm run start:prod
```

## テスト

```bash
# 単体テスト
$ npm run test

# E2Eテスト
$ npm run test:e2e

# テストカバレッジ
$ npm run test:cov
```

## Docker / Cloud Run

- **ローカル開発**: `docker compose up --build server`
  - 本番環境と同じイメージをビルドします。
  - ホストのポート 5001 をコンテナの 8080 にマップします。
  - オプションの Postgres `db` サービスも起動します。

- **データベース**:
  - コンテナ内のデータベースホスト名は `db` です。
  - デフォルトのローカル接続文字列: `postgresql://app:app@db:5432/app` (DBを使用し始めたら調整してください)

- **Cloud Run**:
  - デプロイコマンド例: `gcloud run deploy <SERVICE_NAME> --source . --region <REGION> --allow-unauthenticated --set-env-vars KEY=VALUE`
  - PORT は Cloud Run によって提供され、アプリは自動的にバインドします。

- **環境変数**:
  - ローカルの `docker compose` 実行時は `.env` ファイルに機密情報を保持してください。
  - イメージ内に機密情報を埋め込まないでください。Cloud Run のサービス環境変数を使用してください。
