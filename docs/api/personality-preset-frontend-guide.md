# 性格プリセット機能 フロントエンド実装ガイド

## 概要

このドキュメントは、性格プリセット機能のフロントエンド実装に必要な情報をまとめたものです。

**機能概要:**
- ユーザーが好みの AI コミュニケーションスタイル（性格プリセット）を選択できる
- バックエンドは選択されたプリセット ID のみを保存
- **フロントエンドが ID から表示名への変換を担当**
- プリセットによって AI の口調・説明の深さ・スタンスが変化

---

## 1. API エンドポイント

### 1.1 利用可能なプリセット ID 一覧取得

| 項目 | 内容 |
|------|------|
| **Method** | `GET` |
| **Path** | `/personality-presets` |
| **認証** | 必要（Cookie または Bearer Token） |
| **ロール制限** | なし（ログイン済みユーザー全員） |

#### リクエスト例
```bash
curl -X GET https://api.example.com/personality-presets \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### レスポンス例
```json
{
  "presetIds": [
    "default_assistant",
    "kind_mentor",
    "strict_reviewer",
    "brainstorm_buddy",
    "pm_view",
    "beginner_teacher",
    "evidence_analyst",
    "ultra_concise",
    "kind_senpai_mentor",
    "practical_coach",
    "friendly_peer",
    "company_concierge",
    "pm_style_mentor",
    "quiz_teacher",
    "role_model_senior",
    "kawaii_maid_helper",
    "cool_answer_mentor"
  ]
}
```

---

### 1.2 ユーザーの現在のプリセット設定取得

| 項目 | 内容 |
|------|------|
| **Method** | `GET` |
| **Path** | `/users/personality-preset` |
| **認証** | 必要（Cookie または Bearer Token） |
| **ロール制限** | なし（ログイン済みユーザー全員） |

#### リクエスト例
```typescript
const response = await fetch('/users/personality-preset', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const data = await response.json();
// { "presetId": "kind_mentor" } または { "presetId": null }
```

#### レスポンス例
```json
{
  "presetId": "kind_mentor"
}
```

未設定の場合:
```json
{
  "presetId": null
}
```

---

### 1.3 ユーザーのプリセット設定更新

| 項目 | 内容 |
|------|------|
| **Method** | `PUT` |
| **Path** | `/users/personality-preset` |
| **認証** | 必要（Cookie または Bearer Token） |
| **ロール制限** | `NEW_HIRE` のみ |

#### リクエスト例
```typescript
const response = await fetch('/users/personality-preset', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    presetId: 'kind_mentor'  // または null でデフォルトに戻す
  })
});

const result = await response.json();
// { "message": "Personality preset updated successfully" }
```

#### リクエストボディ
```json
{
  "presetId": "kind_mentor"
}
```

#### レスポンス例
```json
{
  "message": "Personality preset updated successfully"
}
```

#### エラーレスポンス例
```json
{
  "error": "Invalid preset ID."
}
```

---

## 2. フロントエンド実装ガイド

### 2.1 プリセット ID → 表示名の変換マップ

フロントエンド側で以下のマッピングを実装してください。

```typescript
// src/constants/personalityPresets.ts

export const PERSONALITY_PRESET_LABELS: Record<string, string> = {
  // 汎用プリセット
  default_assistant: '標準アシスタント',
  kind_mentor: 'やさしいメンター',
  strict_reviewer: '厳しめレビューア',
  brainstorm_buddy: 'アイデア出しパートナー',
  pm_view: 'プロダクトマネージャー視点',
  beginner_teacher: 'はじめて先生',
  evidence_analyst: 'データ重視アナリスト',
  ultra_concise: '一言マスター',
  
  // 新人教育特化プリセット
  kind_senpai_mentor: 'やさしい先輩メンター',
  practical_coach: 'ちょい厳しめ実務コーチ',
  friendly_peer: '同期ポジの相談相手',
  company_concierge: '社内なんでも案内係',
  pm_style_mentor: 'PM視点の先輩',
  quiz_teacher: 'クイズ先生',
  role_model_senior: 'ロールモデル先輩',
  
  // 特殊プリセット
  kawaii_maid_helper: 'お世話好きアシスタント',
  cool_answer_mentor: 'クールに決める先輩',
};

export const PERSONALITY_PRESET_DESCRIPTIONS: Record<string, string> = {
  default_assistant: '落ち着いた丁寧な口調で、質問に対してバランスよく回答する標準モード。',
  kind_mentor: '初心者や不慣れな人向けに、できるだけ噛み砕いて説明し、背中を押してくれるメンター。',
  strict_reviewer: 'アウトプットに対して率直に改善点を指摘するレビュー担当。甘やかさずに質を上げたいとき用。',
  brainstorm_buddy: 'アイデアを広げたいときに、一緒に発想してくれるモード。発散思考寄り。',
  pm_view: 'ユーザー価値・ビジネスインパクト・優先度の観点からコメントするモード。',
  beginner_teacher: '対象分野がまったく初めての人向けに、小学生〜高校生レベルでもわかる説明を心がけるモード。',
  evidence_analyst: '結論よりも根拠・前提・条件を丁寧に整理してくれるモード。',
  ultra_concise: 'とにかく短く結論だけ知りたいときのモード。',
  kind_senpai_mentor: '1〜2年目の面倒見がいい先輩のイメージ。社内用語や制度を、背景も含めて優しく教えてくれる。',
  practical_coach: '頼れるけど少しストイックな先輩。理解度を確認しながら、実務レベルまで落とし込むコーチング役。',
  friendly_peer: '同じタイミングで入社した同期のようなキャラ。『自分も最初そこ分からなかった』というスタンスで寄り添う。',
  company_concierge: '人事・総務に詳しい案内係のイメージ。福利厚生、申請フロー、相談窓口などを整理して教える。',
  pm_style_mentor: '少し先のキャリアの先輩。タスクや知識が、ユーザー価値やビジネスにどう繋がるかを解説してくれる。',
  quiz_teacher: '説明よりも『理解しているか』を重視するモード。短いクイズや○×問題で知識定着を助ける。',
  role_model_senior: '活躍している先輩社員をモデルにしたキャラ。実務上の工夫や失敗談を交えながら教えてくれる。',
  kawaii_maid_helper: 'メイドさん風の、気配り上手な新人専属アシスタント。分からないことや不安を、やわらかい雰囲気でサポートしてくれる。',
  cool_answer_mentor: '結論ファーストで、無駄を削ぎ落としたクールな回答をしてくれる先輩。意思決定や優先度づけで迷ったときに頼れる。',
};

// カテゴリ分類
export const PRESET_CATEGORIES = {
  general: [
    'default_assistant',
    'kind_mentor',
    'strict_reviewer',
    'brainstorm_buddy',
    'pm_view',
    'beginner_teacher',
    'evidence_analyst',
    'ultra_concise',
  ],
  onboarding: [
    'kind_senpai_mentor',
    'practical_coach',
    'friendly_peer',
    'company_concierge',
    'pm_style_mentor',
    'quiz_teacher',
    'role_model_senior',
    'kawaii_maid_helper',
    'cool_answer_mentor',
  ],
};
```

---

### 2.2 実装例: プリセット選択 UI

```typescript
// src/components/PersonalityPresetSelector.tsx
import { useState, useEffect } from 'react';
import { 
  PERSONALITY_PRESET_LABELS, 
  PERSONALITY_PRESET_DESCRIPTIONS 
} from '@/constants/personalityPresets';

export function PersonalityPresetSelector() {
  const [presetIds, setPresetIds] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 初期化: プリセット一覧と現在の設定を取得
  useEffect(() => {
    async function initialize() {
      // 1. プリセット一覧取得
      const presetsRes = await fetch('/personality-presets');
      const { presetIds } = await presetsRes.json();
      setPresetIds(presetIds);

      // 2. 現在の設定取得
      const currentRes = await fetch('/users/personality-preset');
      const { presetId } = await currentRes.json();
      setSelectedPreset(presetId);
    }
    initialize();
  }, []);

  // プリセット選択時の処理
  const handleSelectPreset = async (presetId: string) => {
    setLoading(true);
    try {
      const response = await fetch('/users/personality-preset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      });

      if (response.ok) {
        setSelectedPreset(presetId);
        // 成功メッセージ表示
        alert('性格プリセットを変更しました');
      } else {
        const error = await response.json();
        alert(`エラー: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to update preset:', error);
      alert('プリセットの変更に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="preset-selector">
      <h2>AI の性格を選択</h2>
      <div className="preset-grid">
        {presetIds.map((presetId) => (
          <button
            key={presetId}
            className={selectedPreset === presetId ? 'selected' : ''}
            onClick={() => handleSelectPreset(presetId)}
            disabled={loading}
          >
            <h3>{PERSONALITY_PRESET_LABELS[presetId] || presetId}</h3>
            <p>{PERSONALITY_PRESET_DESCRIPTIONS[presetId]}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

### 2.3 表示例: チャット画面での現在のプリセット表示

```typescript
// src/components/ChatHeader.tsx
import { useEffect, useState } from 'react';
import { PERSONALITY_PRESET_LABELS } from '@/constants/personalityPresets';

export function ChatHeader() {
  const [currentPreset, setCurrentPreset] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCurrentPreset() {
      const response = await fetch('/users/personality-preset');
      const { presetId } = await response.json();
      setCurrentPreset(presetId);
    }
    fetchCurrentPreset();
  }, []);

  const displayName = currentPreset 
    ? PERSONALITY_PRESET_LABELS[currentPreset] 
    : '標準アシスタント';

  return (
    <div className="chat-header">
      <h1>AI チャット</h1>
      <p className="current-preset">
        現在の性格: <strong>{displayName}</strong>
      </p>
    </div>
  );
}
```

---

## 3. 注意事項

### 3.1 ID と表示名の同期

- **バックエンドは ID のみを扱います**
- **フロントエンドで ID → 表示名の変換を必ず実装してください**
- 新しいプリセットが追加された場合は、フロントエンドのマッピングも更新が必要です

### 3.2 デフォルト値の扱い

- `presetId` が `null` の場合は「標準アシスタント」(`default_assistant`) として扱う
- UI では「標準アシスタント」をデフォルト選択として表示

### 3.3 ロール制限

- プリセットの**更新**は `NEW_HIRE` ロールのみ可能
- `MENTOR` ロールはプリセット一覧の取得と現在の設定の参照のみ可能

### 3.4 エラーハンドリング

- 存在しないプリセット ID を送信した場合は `400 Bad Request` が返される
- ユーザーに分かりやすいエラーメッセージを表示してください

---

## 4. 実装チェックリスト

フロントエンド実装時に以下を確認してください:

- [ ] `PERSONALITY_PRESET_LABELS` マッピングを実装
- [ ] `PERSONALITY_PRESET_DESCRIPTIONS` マッピングを実装
- [ ] プリセット選択 UI を実装
- [ ] 現在のプリセット表示を実装
- [ ] プリセット変更後の成功/失敗メッセージ表示
- [ ] `NEW_HIRE` ロールのみが変更可能な制御を実装
- [ ] デフォルト値 (`null` → `default_assistant`) の処理を実装
- [ ] 不明な ID への対応（フォールバック処理）

---

## 5. 今後の拡張可能性

将来的に以下の機能が追加される可能性があります:

- **プリセット詳細取得 API** (`GET /personality-presets/:presetId`)
  - プリセットの詳細情報（口調、深さ、厳しさ、制約など）を取得可能に
  - UI でより詳細な説明を表示したい場合に使用
- **カテゴリフィルタリング**
  - 汎用プリセット / 新人教育特化プリセットでの絞り込み
- **プリセット推薦機能**
  - ユーザーの使い方に応じたプリセット推薦

---

## 6. 参考情報

- [要件定義書](../features/personality-preset-requirements.md)
- [実装計画](../../.gemini/antigravity/brain/42ccfd6a-35a3-4403-b528-042c816e7e18/implementation_plan.md)
