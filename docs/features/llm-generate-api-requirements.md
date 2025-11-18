# LLM Generate API 要件定義

## 1. 背景と目的
- 学生チャット (`StudentChatPage`) はユーザーのメッセージ送信後に LLM(Gemini) へ問い合わせて回答テキストを取得する。
- 現状は Next.js App Router 上の `POST /api/llm/gemini` が Google GenAI SDK へ直接アクセスしているが、今後は独立した API サーバー上で同等の処理を提供する必要がある。
- 本ドキュメントは **`POST /llm/generate`** エンドポイント単体をバックエンドで実装する際の要件をまとめる。

## 2. 想定利用者 / クライアント
- RetentionEngine のフロントエンド (StudentChat view)。Clean Architecture 層の `LLMPort.generate()` が HTTP 経由で呼ぶ。
- 将来的に Mentor 側ツールや自動テストでも利用する可能性があるため、RESTful JSON API とする。

## 3. 認証・権限
- **要ログイン**: API サーバー側でセッション Cookie (`auth_access_token`) または Bearer Token を検証し、`NEW_HIRE` または `MENTOR` ロールのみに許可。
- LLM API キー (`GEMINI_API_KEY`) は API サーバーにのみ配置し、クライアントへは公開しない。

## 4. エンドポイント仕様

| Method | Path | 概要 |
| --- | --- | --- |
| `POST` | `/llm/generate` | 与えられた Prompt を Gemini へ転送し、生成テキストを返却する。 |

### 4.1 リクエスト
- **ヘッダー**: `Content-Type: application/json`, 認証ヘッダー or Cookie
- **Body**
  ```json
  {
    "question": "今回の質問",
    "conversationId": "conv-123"
  }
  ```
  - `question`: 新入社員が送信した最新メッセージのみを渡す。  
  - `conversationId`: 省略時はサーバー側で現在の会話を推測し、指定時はその会話の履歴を参照。  
  - 過去履歴やシステムプロンプトは **サーバー側で Supabase 等から収集して組み立てる**。クライアントは生の会話履歴を送らない。
  - モデル選択やパラメータ調整はサーバー設定で一元管理し、将来的なモデル変更は別 API で行う。

### 4.2 レスポンス
- **成功 (HTTP 200)**
  ```json
  {
    "answer": "生成された回答本文"
  }
  ```
  - Gemini から得た最終テキストのみを返す。詳細メタ情報（モデル名、token 使用量、safety filters など）はサーバー内部でログ化し、クライアントには渡さない。

- **エラー**
  | ステータス | 条件 | 例 |
  | --- | --- | --- |
  | 400 | 不正 JSON / 必須項目欠如 / `question` が空 | `{ "error": "question must not be empty." }` |
  | 401 | 未ログイン / トークン無効 | `{ "error": "Unauthorized" }` |
  | 403 | ロールが許可されていない | `{ "error": "Forbidden" }` |
  | 429 | Gemini レート制限 (SDK からの応答に応じてマッピング) | `{ "error": "Gemini rate limit exceeded." }` |
  | 5xx | LLM 連携失敗 / 予期せぬ例外 | `{ "error": "Gemini request failed." }` |

## 5. 処理フロー
1. 認証検証: Cookie / Authorization を確認し、必要なら Supabase Admin API でユーザーを再検証。
2. 入力バリデーション: `question` と `conversationId`(任意) をチェック。
3. サーバー側で `conversationId` から最新の会話履歴を取得し、ビジネスルールに沿ってシステムプロンプト＋履歴メッセージを組み立てる。
4. Gemini クライアント生成 (`GEMINI_API_KEY` とサーバー設定済みのモデル ID を使用)。
5. `generateContent` を呼び、レスポンスから `text` とメタ情報を抽出。
6. 結果を JSON で返却。エラー時は上記マッピングを遵守。
7. 監査ログ: `conversationId`、ユーザー ID、使用モデル、ステータス、処理時間を保存。

## 6. 非機能要件
- **パフォーマンス**: 1 リクエストあたり 15 秒タイムアウトを上限にし、フロントでリトライを制御。
- **スケーラビリティ**: Gemini 呼び出しは I/O 待ち時間が支配的なため、API サーバー側は非同期 I/O を利用。
- **可観測性**: 成功/失敗件数、レイテンシ、LLM レート制限発生数をメトリクスとして記録。
- **セキュリティ**: `prompt` には個人情報が含まれるため、ログには全文を残さずハッシュ化した ID を記録する。

## 7. フロントエンドとのインターフェース
- `GeminiLLMPort` は `fetch("/llm/generate", { body: JSON.stringify({ question, conversationId }) })` を実行するだけなので、URL/レスポンス形式を合わせれば既存実装を再利用可能。
- エラー文言は `Error.message` として UI に表示されるため、ユーザー向けの短いテキストに整形する。

## 8. 今後の拡張余地
- ストリーミング応答 (`Server-Sent Events` or `WebSocket`) への対応。
- モデル選択 UI を想定した `GET /llm/models` エンドポイント。
- 監査用に Prompt/Response を暗号化して保存し、後からメンターが参照できるようにする。

以上がバックエンド実装時に必要な要件であり、本仕様に準拠して `/llm/generate` を切り出せば現行フロントエンドとの互換性を保てます。
