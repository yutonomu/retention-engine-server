# 性格プリセット（人格プリセット）機能 要件定義

## 1. 背景と目的

### 1.1 背景
- 新人教育向けRAGチャットシステムにおいてAIの返答が「味気ない・つまらない」と感じられる可能性がある
- ユーザーの状況や学習スタイル、気分に応じて、AIのコミュニケーションスタイルを柔軟に切り替えたい
- 「やさしい先輩」「ちょい厳しめコーチ」「同期ポジ」など、実際に社内にいそうなキャラクターをモデル化する

### 1.2 目的
- 会話のスタイルやスタンスを明示的なプリセットとして提供し、ユーザーが自由に切り替えられるようにする
- ユーザーごとに好みのプリセットを保存し、チャット体験をパーソナライズする
- LLMのシステムプロンプトに性格プリセット情報を動的に組み込み、一貫したキャラクター性を実現する

## 2. 想定利用者 / クライアント
- RetentionEngine のフロントエンド (プロフィール設定ビュー、チャットビュー)
- NEW_HIRE ロールのユーザーが自身の好みのプリセットを選択・変更できる
- Mentorも参考情報として閲覧できる可能性がある (将来的な拡張)

## 3. 認証・権限
- **プリセット選択/更新**: `NEW_HIRE` ロールのユーザーのみが自分自身のプリセットを選択・更新可能
- **プリセット一覧取得**: ログインユーザーであれば誰でも利用可能なプリセット一覧を取得可能
- **プリセット詳細取得**: ログインユーザーであれば誰でも特定のプリセット情報を取得可能
- セッション Cookie (`auth_access_token`) または Bearer Token で認証

## 4. データモデル定義

### 4.1 PersonalityPreset 型定義

```typescript
type Depth = 'shallow' | 'normal' | 'normal_to_deep' | 'deep' | 'step_by_step' | 'wide';
type Strictness = 'low' | 'normal' | 'medium' | 'medium_to_high' | 'high';
type Proactivity = 'low' | 'normal' | 'high' | 'very_high';

interface PersonalityPreset {
  /** 内部 ID（プログラム上で一意） */
  id: string;
  /** UI に表示する名前 */
  displayName: string;
  /** どんなキャラクターか・どんな時に使うか */
  description: string;
  /** 口調・話し方のスタイル（日本語で記述） */
  tone: string;
  /** 回答の深さ・解説の厚み */
  depth: Depth;
  /** 指摘・フィードバックの厳しさ */
  strictness: Strictness;
  /** ユーザーに質問・提案を投げかける積極性 */
  proactivity: Proactivity;
  /** そのプリセット専用のコア system prompt 文 */
  systemPromptCore: string;
}
```

## 4. エンドポイント仕様

### 4.1 プリセット一覧取得エンドポイント

| Method | Path | 概要 |
| --- | --- | --- |
| `GET` | `/personality-presets` | 利用可能なプリセット一覧（ID + 表示名）を取得する |

#### リクエスト
- **ヘッダー**: 認証ヘッダー or Cookie
- **Body**: なし

#### レスポンス
- **成功 (HTTP 200)**
  ```json
  {
    "presets": [
      {
        "id": "default_assistant",
        "displayName": "標準アシスタント"
      },
      {
        "id": "kind_mentor",
        "displayName": "やさしいメンター"
      },
      {
        "id": "strict_reviewer",
        "displayName": "厳しめレビューア"
      }
      // ... 全17個のプリセット
    ]
  }
  ```

- **エラー**
  | ステータス | 条件 | 例 |
  | --- | --- | --- |
  | 401 | 未ログイン / トークン無効 | `{ "error": "Unauthorized" }` |
  | 500 | プリセットデータ取得失敗 | `{ "error": "Failed to fetch presets." }` |

### 4.2 プリセット詳細取得エンドポイント（将来実装）

※ このエンドポイントは現時点では実装せず、将来的にフロントエンドで詳細情報が必要になった場合に追加する。

| Method | Path | 概要 |
| --- | --- | --- |
| `GET` | `/personality-presets/:presetId` | （将来実装）特定のプリセットの詳細情報を取得する |

#### 実装方針（将来）
- プリセットの詳細情報（displayName, description, focus, constraints等）をJSONレスポンスとして返す
- `systemPromptCore`は内部処理用のため、レスポンスには含めない

---

### 4.3 ユーザープリセット設定取得エンドポイント

| Method | Path | 概要 |
| --- | --- | --- |
| `GET` | `/users/personality-preset` | 自分の現在の性格プリセット設定を取得する |

#### リクエスト
- **ヘッダー**: 認証ヘッダー or Cookie
- **Body**: なし

#### レスポンス
- **成功 (HTTP 200)**
  ```json
  {
    "presetId": "kind_mentor"
  }
  ```
  または、未設定の場合
  ```json
  {
    "presetId": null
  }
  ```

- **エラー**
  | ステータス | 条件 | 例 |
  | --- | --- | --- |
  | 401 | 未ログイン / トークン無効 | `{ "error": "Unauthorized" }` |
  | 404 | ユーザーが存在しない | `{ "error": "User not found" }` |
  | 500 | データベース取得失敗 | `{ "error": "Failed to fetch user preset." }` |

### 4.4 ユーザープリセット設定更新エンドポイント

| Method | Path | 概要 |
| --- | --- | --- |
| `PUT` | `/users/personality-preset` | 自分の性格プリセット設定を登録または更新する (アップサート) |

- 既存値があれば上書き、未設定なら新規登録

#### リクエスト
- **ヘッダー**: `Content-Type: application/json`, 認証ヘッダー or Cookie
- **Body**
  ```json
  {
    "presetId": "kind_mentor"
  }
  ```
  - `presetId`: 存在する有効なプリセットIDまたは`null` (デフォルトに戻す)

#### レスポンス
- **成功 (HTTP 200)**
  ```json
  {}
  ```

- **エラー**
  | ステータス | 条件 | 例 |
  | --- | --- | --- |
  | 400 | 不正なプリセットID / 必須項目欠如 | `{ "error": "Invalid preset ID." }` |
  | 401 | 未ログイン / トークン無効 | `{ "error": "Unauthorized" }` |
  | 403 | ロールが許可されていない | `{ "error": "Forbidden" }` |
  | 404 | プリセットが存在しない | `{ "error": "Preset not found" }` |
  | 500 | データベース更新失敗 | `{ "error": "Failed to update personality preset." }` |

## 5. データベーススキーマ変更

### user テーブルへの追加カラム

```sql
ALTER TABLE "user" ADD COLUMN personality_preset_id VARCHAR(50) NULL;
```

- **カラム名**: `personality_preset_id`
- **型**: `VARCHAR(50)` または `TEXT` (Supabaseの場合)
- **制約**: NULL許可 (未設定のユーザーがいるため)
- **初期値**: `NULL`
- **プリセット定義の管理**: JSONファイル (`src/personality-preset/presets.json`) で管理
- **バリデーション**: アプリケーション層でプリセットIDの存在チェックを行う

## 6. LLM統合: プロンプトへのプリセット情報追加

### 6.1 処理フロー
1. ユーザーがチャットメッセージを送信
2. LLMService の `generate()` メソッドで、ユーザーIDから性格プリセット設定を取得
3. プリセットが設定されている場合、該当するプリセットの詳細情報を取得
4. システムプロンプトにプリセット情報を組み込んだプロンプトを生成
5. プリセットが未設定の場合、デフォルトプリセット(`default_assistant`)を使用

### 6.2 システムプロンプトテンプレート

```typescript
const SYSTEM_PROMPT_TEMPLATE = `
あなたは社内新人教育向けの RAG ベース AI アシスタントです。

これから会話するときは、次の「性格プリセット」の仕様に従って振る舞ってください。

- プリセット ID: {{id}}
- 名前: {{displayName}}
- 説明: {{description}}
- 口調: {{tone}}
- 回答の深さ: {{depth}}
- 厳しさレベル: {{strictness}}
- 積極性: {{proactivity}}

プリセットごとの追加指示:
{{systemPromptCore}}

上記の方針に従いつつ、RAG により取得した社内ドキュメントの内容を踏まえて、
新人が安心して学べるように回答してください。
`.trim();
```

### 6.3 プロンプト生成例

```typescript
// LlmService内での実装イメージ

async generateSystemPrompt(userId: string): Promise<string> {
  // 1. ユーザーのプリセット設定を取得
  const userPreference = await this.getUserPersonalityPreference(userId);
  const presetId = userPreference?.presetId || 'default_assistant';
  
  // 2. プリセット詳細を取得
  const preset = await this.getPersonalityPreset(presetId);
  
  // 3. テンプレートに値を埋め込む
  const focusList = preset.focus.map(f => `  - ${f}`).join('\n');
  const constraintsList = preset.constraints.map(c => `  - ${c}`).join('\n');
  
  return SYSTEM_PROMPT_TEMPLATE
    .replace('{{id}}', preset.id)
    .replace('{{displayName}}', preset.displayName)
    .replace('{{description}}', preset.description)
    .replace('{{tone}}', preset.tone)
    .replace('{{depth}}', preset.depth)
    .replace('{{strictness}}', preset.strictness)
    .replace('{{proactivity}}', preset.proactivity)
    .replace('{{focus を箇条書き展開}}', focusList)
    .replace('{{constraints を箇条書き展開}}', constraintsList)
    .replace('{{systemPromptCore}}', preset.systemPromptCore);
}
```

## 7. 実装の優先順位とフェーズ

### Phase 0: データベーススキーマとプリセット定義準備
1. データベーススキーマ変更 (user テーブルに personality_preset_id カラム追加)
2. `src/personality-preset/presets.json` ファイル作成（17個のプリセット定義）

### Phase 1: プリセット管理API (読み取り専用)
1. PersonalityPreset エンティティ定義
2. PersonalityPresetRepository 実装
3. PersonalityPresetService 実装
   - `findAll()`: 全プリセット取得
   - `findByCategory()`: カテゴリ別プリセット取得
   - `findById()`: ID指定でプリセット取得
4. PersonalityPresetController 実装
   - `GET /personality-presets`
   - `GET /personality-presets/:presetId`
5. APIのユニットテスト・E2Eテスト作成

### Phase 2: ユーザープリセット設定API
1. User エンティティに `personalityPresetId` フィールド追加
2. UserService にプリセット設定関連メソッド追加
   - `getUserPersonalityPreset()`: ユーザーのプリセット設定取得
   - `updateUserPersonalityPreset()`: ユーザーのプリセット設定更新
3. UserController に新規エンドポイント追加
   - `GET /user/personality-preset`
   - `PUT /user/personality-preset`
4. バリデーション実装 (存在するプリセットIDかチェック)
5. APIのユニットテスト・E2Eテスト作成

### Phase 3: LLM統合
1. LlmService にプリセット取得・プロンプト生成ロジック追加
   - PersonalityPresetService を依存注入
   - `generateSystemPrompt()`: プリセットベースのシステムプロンプト生成
2. `generate()` メソッドを修正し、ユーザーのプリセット設定を考慮
3. デフォルトプリセット (`default_assistant`) のフォールバック処理
4. プロンプト生成のユニットテスト作成
5. E2Eテストでプリセット別の応答確認

### Phase 4: フロントエンド連携 (別リポジトリ)
1. プロフィール設定画面でプリセット選択UI実装
2. プリセット一覧取得API呼び出し
3. プリセット設定更新API呼び出し
4. チャット画面での現在のプリセット表示 (オプション)

## 8. 非機能要件

- **パフォーマンス**: 
  - プリセットマスターデータはアプリケーション起動時にキャッシュ
  - ユーザーのプリセット設定は既存のユーザー情報取得と同時に取得し、追加のDB問い合わせを最小化
- **データ整合性**: 
  - プリセットIDのバリデーションを厳格に行い、不正な値の保存を防止
  - 外部キー制約により、存在しないプリセットIDの設定を防止
- **拡張性**: 
  - 新規プリセットの追加が容易な設計
  - プリセット定義の変更時は、既存ユーザーの設定に影響を与えない
- **後方互換性**: 
  - プリセットが未設定のユーザーでも既存機能が正常に動作すること
  - デフォルトプリセットへのフォールバック処理を必ず実装

## 9. テスト要件

### ユニットテスト
- PersonalityPresetService
  - プリセット取得処理 (全件、ID指定、カテゴリ指定)
  - 存在しないプリセットIDの処理
- UserService
  - ユーザープリセット設定の取得・更新
  - プリセットIDのバリデーション
- LlmService
  - プロンプト生成ロジック (プリセット有り/無し)
  - デフォルトプリセットへのフォールバック

### E2Eテスト
- プリセット一覧取得フロー
- プリセット詳細取得フロー
- ユーザープリセット設定登録・更新フロー
- ユーザープリセット設定取得フロー
- プリセットを考慮したチャット応答生成

## 10. 初期プリセット一覧

システムには以下の17個のプリセットを初期データとして提供する:

### 汎用プリセット (8個)
1. `default_assistant` - 標準アシスタント
2. `kind_mentor` - やさしいメンター
3. `strict_reviewer` - 厳しめレビューア
4. `brainstorm_buddy` - アイデア出しパートナー
5. `pm_view` - プロダクトマネージャー視点
6. `beginner_teacher` - はじめて先生
7. `evidence_analyst` - データ重視アナリスト
8. `ultra_concise` - 一言マスター

### 新人教育特化プリセット (7個)
9. `kind_senpai_mentor` - やさしい先輩メンター
10. `practical_coach` - ちょい厳しめ実務コーチ
11. `friendly_peer` - 同期ポジの相談相手
12. `company_concierge` - 社内なんでも案内係
13. `pm_style_mentor` - PM視点の先輩
14. `quiz_teacher` - クイズ先生
15. `role_model_senior` - ロールモデル先輩

### 特殊プリセット (2個)
16. `kawaii_maid_helper` - お世話好きアシスタント (メイド風)
17. `cool_answer_mentor` - クールに決める先輩

※ 詳細な定義は元仕様書の第3章を参照

## 11. 今後の拡張可能性

- メンターがメンティーのプリセット設定を閲覧できる機能
- ユーザーカスタマイズ可能なプリセット (パラメータ微調整)
- プリセット別の利用統計分析とプロンプトチューニング
- 会話の文脈や内容に応じた自動プリセット推薦
- 時間帯や状況に応じたプリセットの自動切り替え
- 管理画面からの新規プリセット追加・編集機能
- A/Bテストによるプリセット効果測定

## 12. 成功指標

- **プリセット設定率**: アクティブユーザーの70%以上がデフォルト以外のプリセットを設定
- **プリセット切り替え率**: ユーザーが複数のプリセットを試す率 (セッションあたり平均1.5回以上)
- **ユーザー満足度**: プリセット機能に対する肯定的フィードバック率80%以上
- **エンゲージメント**: プリセット設定ユーザーのチャット継続率・メッセージ数の向上
- **定着率**: 一度プリセットを設定したユーザーの継続利用率90%以上
