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

### 1.1 利用可能なプリセット一覧取得

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
    // ... 全17個
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

if (response.ok) {
  // 成功 (HTTP 200)
}
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

### 2.1 推奨実装パターン

APIから取得した`id`と`displayName`をそのまま使用してください。フロントエンドでのマッピング定義は不要です。

**オプション: 説明文をフロントエンドで管理する場合**

APIは`id`と`displayName`のみ返すため、詳細な説明文が必要な場合のみ、フロントエンド側で管理してください。

```typescript
// src/constants/personalityPresets.ts (オプション)

export const PERSONALITY_PRESET_DESCRIPTIONS: Record<string, string> = {
  default_assistant: '落ち着いた丁寧な口調で、質問に対してバランスよく回答する標準モード。',
  kind_mentor: '初心者や不慣れな人向けに、できるだけ噛み砕いて説明し、背中を押してくれるメンター。',
  strict_reviewer: 'アウトプットに対して率直に改善点を指摘するレビュー担当。甘やかさずに質を上げたいとき用。',
  // ... 必要に応じて他のプリセットも
};
```

---

### 2.2 実装例: プリセット選択 UI

```typescript
// src/components/PersonalityPresetSelector.tsx
import { useState, useEffect } from 'react';

type Preset = {
  id: string;
  displayName: string;
};

export function PersonalityPresetSelector() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 初期化: プリセット一覧と現在の設定を取得
  useEffect(() => {
    async function initialize() {
      // 1. プリセット一覧取得
      const presetsRes = await fetch('/personality-presets');
      const { presets } = await presetsRes.json();
      setPresets(presets);

      // 2. 現在の設定取得
      const currentRes = await fetch('/users/personality-preset');
      const { presetId } = await currentRes.json();
      setSelectedPresetId(presetId);
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
        setSelectedPresetId(presetId);
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
        {presets.map((preset) => (
          <button
            key={preset.id}
            className={selectedPresetId === preset.id ? 'selected' : ''}
            onClick={() => handleSelectPreset(preset.id)}
            disabled={loading}
          >
            <h3>{preset.displayName}</h3>
            {/* オプション: 説明文を表示する場合 */}
            {/* <p>{PERSONALITY_PRESET_DESCRIPTIONS[preset.id]}</p> */}
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

type Preset = {
  id: string;
  displayName: string;
};

export function ChatHeader() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      // プリセット一覧取得
      const presetsRes = await fetch('/personality-presets');
      const { presets } = await presetsRes.json();
      setPresets(presets);

      // 現在の設定取得
      const currentRes = await fetch('/users/personality-preset');
      const { presetId } = await currentRes.json();
      setCurrentPresetId(presetId);
    }
    fetchData();
  }, []);

  const currentPreset = presets.find(p => p.id === currentPresetId);
  const displayName = currentPreset?.displayName || '標準アシスタント';

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

### 3.1 表示名の取得

- **APIが`displayName`を提供します**
- フロントエンドは API から取得した `displayName` をそのまま使用してください
- マッピング定義は不要ですが、説明文（`description`）が必要な場合のみフロントエンドで管理してください

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

- [ ] APIから`presets`配列（`id`と`displayName`）を取得
- [ ] プリセット選択 UI を実装
- [ ] 現在のプリセット表示を実装（APIから取得した`displayName`を使用）
- [ ] プリセット変更後の成功/失敗メッセージ表示
- [ ] `NEW_HIRE` ロールのみが変更可能な制御を実装
- [ ] デフォルト値 (`null` → `default_assistant`) の処理を実装
- [ ] 不明な ID への対応（フォールバック処理）
- [ ] (オプション) 詳細説明が必要な場合のみ`PERSONALITY_PRESET_DESCRIPTIONS`を実装

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
