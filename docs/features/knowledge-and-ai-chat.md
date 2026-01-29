# ナレッジ抽出 & AIチャット深掘り機能

## 概要

ベテラン社員がAIチャットで業務相談をする中で、暗黙知（対応方法・業界用語・業務知識）を自然に言語化させ、チーム全体で共有可能なナレッジとして蓄積する機能。

2つの機能が連携して動作する:

1. **AIチャットの深掘り質問**: AIがユーザーに状況確認の質問を投げかけ、会話を深めることで暗黙知の言語化を促す
2. **ナレッジ抽出・蓄積**: 深まった会話からLLMがナレッジを抽出し、重複チェック付きでDBに保存する

---

## 1. AIチャットのシステムプロンプト構造

### ファイル

- `src/llm/llm.service.ts`

### 4層プロンプト構造

システムプロンプトは以下の4層で構成される。`buildSystemPromptFromPreset()` メソッド（345行目付近）で結合される。

```
第1層: FILE_SEARCH_INSTRUCTION      ← RAGルール + 会話の原則
第2層: KNOWLEDGE_ELICITATION_INSTRUCTION  ← 深掘り質問の指示
第3層: PersonalityPreset             ← 口調・スタイル（16種類）
第4層: MBTI                          ← ユーザー個別の最適化（任意）
```

結合コード:
```typescript
return `${FILE_SEARCH_INSTRUCTION}\n\n---\n\n${KNOWLEDGE_ELICITATION_INSTRUCTION}\n\n---\n\n${personalityPrompt}${mbtiInstruction}`;
```

プリセット未設定時のフォールバック（312行目付近）:
```typescript
return `${FILE_SEARCH_INSTRUCTION}\n\n---\n\n${KNOWLEDGE_ELICITATION_INSTRUCTION}${mbtiInstruction}`;
```

### 第1層: FILE_SEARCH_INSTRUCTION

RAGベースの回答ルールに加え、**【会話の原則】** セクションを含む:

- 「上長に確認してください」「担当者に聞いてください」のように第三者に丸投げしない
- ドキュメントに情報がなくてもユーザー自身の状況を聞いて一緒に考える
- ユーザーに問いかけて会話を続ける

**追加背景**: 当初、AIが「チームリーダーに相談してみてはいかがでしょうか」と回答し、会話が終了してしまう問題があった。第三者への丸投げを禁止することで、AIがユーザーとの対話を継続するようにした。

### 第2層: KNOWLEDGE_ELICITATION_INSTRUCTION

回答の最後にユーザーの状況・経験を確認する質問を1つ追加する指示。

- **通常の質問**: 具体的な状況確認（「何日くらい取得する予定ですか？」など）
- **暗黙知シグナル検出時**: より踏み込んだ深掘り（「例外的なケースはありますか？」など）
  - シグナル例: 「うちでは〜」「普段は〜」「〜というルールがある」
- **ルール**: 質問は1つだけ、第三者に振らない、ユーザーが会話を終えたい場合は質問しない

### 第3層: PersonalityPreset

16種類のプリセットから選択。`src/personality-preset/data/presets.json` に定義。

各プリセットのフィールド: `id`, `displayName`, `description`, `tone`, `depth`, `strictness`, `proactivity`, `systemPromptCore`, `sampleDialogue`

### 第4層: MBTI

`src/user/mbti.types.ts` の `MBTI_COMMUNICATION_STYLES` に基づくユーザー個別のコミュニケーションスタイル調整。

---

## 2. ナレッジ抽出パイプライン

### ファイル

- `src/knowledge/knowledge.controller.ts` — APIエンドポイント
- `src/knowledge/knowledge.service.ts` — ビジネスロジック
- `src/knowledge/knowledge.repository.ts` — Supabase/pgvector永続化
- `src/knowledge/knowledge.port.ts` — ポートインターフェース
- `src/knowledge/knowledge.types.ts` — 型定義
- `src/knowledge/dto/` — DTO群

### APIエンドポイント

全エンドポイントに `JwtAuthGuard` 適用。

| メソッド | パス | 説明 |
|---------|------|------|
| `POST` | `/knowledge/extract` | チャット履歴からナレッジをLLM抽出（プレビューのみ、保存しない） |
| `POST` | `/knowledge/save` | ユーザーが選択した候補を保存 |
| `PATCH` | `/knowledge/:id` | ナレッジのカテゴリを更新 |
| `GET` | `/knowledge` | ナレッジ一覧取得（フィルタ・ページネーション対応） |

### 抽出フロー（2ステップ方式）

```
1. POST /knowledge/extract
   → メッセージ履歴取得 → LLM抽出（Gemini 2.5 Flash）→ 候補を返却（保存しない）

2. POST /knowledge/save
   → ユーザーが選択した候補を受け取る
   → 各候補に対して: embedding生成（text-embedding-004）→ 重複チェック（cosine類似度 >= 0.85）→ 保存
```

### LLM抽出プロンプト（EXTRACTION_PROMPT）

`knowledge.service.ts` 17-56行目に定義。チャット履歴から以下を抽出:

- **対応方法**: 特定の状況での対処法、トラブルシューティング、効率化のコツ
- **業界用語**: 業界・社内特有の専門用語、略語、概念の解説
- **業務知識**: 業務のルール・判断基準・プロセス・ツールの使い方

**出力形式**: JSON配列
```json
[
  {
    "content": "抽出された知識（新人がわかるように具体的に記述）",
    "category": "対応方法" | "業界用語" | "業務知識",
    "tags": ["関連キーワード1", "関連キーワード2"]
  }
]
```

**方針**: ベテラン社員の発言を最優先で抽出。迷ったら抽出する（ユーザーがプレビューで取捨選択可能）。

### 重複チェック

- `text-embedding-004` でembedding生成
- Supabase pgvector の `search_similar_knowledge` RPCで類似検索
- 閾値: cosine類似度 0.85以上で重複とみなす

### カテゴリ正規化

`normalizeCategory()` メソッドで、LLMが返す不正確なカテゴリ名を正規化:

```
「トラブル対応」「ノウハウ」「Tips」→ 「対応方法」
「用語」「専門用語」「略語」→ 「業界用語」
「判断基準」「ルール」「ツール」→ 「業務知識」
```

### データモデル（extracted_knowledge テーブル）

```typescript
interface ExtractedKnowledge {
  id: string;
  content: string;
  category: string;           // "対応方法" | "業界用語" | "業務知識"
  tags: string[];
  source_conversation_id: string | null;
  source_message_range: { startIndex: number; endIndex: number } | null;
  extracted_by: string;        // userId
  embedding: number[] | null;  // pgvector
  created_at: string;
}
```

---

## 3. 使用しているLLMモデル

| 用途 | モデル | サービス |
|------|--------|----------|
| AIチャット応答 | `gemini-2.0-flash` | Google Gemini |
| ナレッジ抽出 | `gemini-2.5-flash` | Google Gemini |
| Embedding生成 | `text-embedding-004` | Google Gemini |

---

## 4. モジュール依存関係

```
KnowledgeModule
├── KnowledgeController
├── KnowledgeService
│   ├── KnowledgePort (→ KnowledgeRepository)
│   ├── MessagePort (→ メッセージ履歴取得)
│   └── GoogleGenAI (Gemini API)
└── KnowledgeRepository
    └── SupabaseAdminClient (pgvector)

LlmModule
├── LlmController
├── LlmService
│   ├── MessagePort
│   ├── UserPort
│   ├── ConversationPort
│   ├── FileSearchAssistant (RAG)
│   ├── PersonalityPresetService
│   ├── InMemoryCacheService
│   └── GeminiCacheService
└── External
    ├── fileSearchAssistant.ts
    ├── hybridRagAssistantV2.ts
    ├── webSearchAssistant.ts
    ├── geminiTextService.ts
    └── geminiFileSearchAssistant/
```

---

## 5. 環境変数

| 変数名 | 用途 |
|--------|------|
| `GOOGLE_API_KEY` | Google Gemini API（チャット応答 + ナレッジ抽出 + Embedding） |
| Supabase関連 | pgvector による類似検索・データ永続化 |

---

## 6. 既知の設計判断

- **プレビュー→保存の2ステップ方式**: ユーザーが抽出結果を確認・選択してから保存。LLMの過剰抽出に対するフィルタリング手段。
- **第三者丸投げ禁止**: AIが「上長に聞いてください」と回答するとナレッジ抽出の材料となる会話が生まれない。必ずユーザーとの対話を続ける設計。
- **深掘り質問は常時**: 暗黙知シグナルがない初回質問でも状況確認の質問を追加。シグナル検出時はより踏み込んだ質問にする。
- **カテゴリ正規化**: LLMが3カテゴリ以外の名前を返しても、マッピングテーブルで吸収する。
