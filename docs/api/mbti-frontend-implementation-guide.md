# MBTI機能 フロントエンド実装ガイド

## 📋 概要

このドキュメントは、MBTI（Myers-Briggs Type Indicator）機能のフロントエンド実装に必要な全ての情報を提供します。

**機能概要:**
- ユーザーが自分のMBTI性格タイプを登録・更新できる
- AIチャット応答がユーザーのMBTIに基づいてパーソナライズされる

---

## 🔐 認証

全てのAPIエンドポイントは**JWT認証が必須**です。

```typescript
headers: {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
}
```

---

## 📡 API仕様

### ベースURL
```
https://your-api-domain.com
または
http://localhost:5000 (開発環境)
```

### 1. MBTI取得 API

**エンドポイント:** `GET /users/mbti`

**認証:** 必須（JWT）

**リクエスト例:**
```typescript
const response = await fetch('http://localhost:5000/users/mbti', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});
const data = await response.json();
```

**レスポンス:**

成功時 (200):
```json
{
  "mbti": "INTJ"
}
```

または未設定の場合:
```json
{
  "mbti": null
}
```

エラー時:
```json
// 401 Unauthorized
{
  "statusCode": 401,
  "message": "Unauthorized"
}

// 404 Not Found
{
  "statusCode": 404,
  "message": "User not found"
}

// 500 Internal Server Error
{
  "statusCode": 500,
  "message": "Failed to fetch MBTI."
}
```

---

### 2. MBTI更新 API

**エンドポイント:** `PUT /users/mbti`

**認証:** 必須（JWT）

**権限:** NEW_HIREロールのみ（MENTORは不可）

**リクエストボディ:**
```json
{
  "mbti": "INTJ"
}
```

**リクエスト例:**
```typescript
const response = await fetch('http://localhost:5000/users/mbti', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    mbti: 'INTJ'
  }),
});
const data = await response.json();
```

**レスポンス:**

成功時 (200):
```json
{
  "message": "MBTI updated successfully"
}
```

エラー時:
```json
// 400 Bad Request (無効なMBTIタイプ)
{
  "statusCode": 400,
  "message": "Invalid MBTI type. Must be one of 16 valid types."
}

// 401 Unauthorized (未認証)
{
  "statusCode": 401,
  "message": "Unauthorized"
}

// 403 Forbidden (MENTORロール)
{
  "statusCode": 403,
  "message": "Forbidden"
}

// 404 Not Found (ユーザーが存在しない)
{
  "statusCode": 404,
  "message": "User not found"
}

// 500 Internal Server Error
{
  "statusCode": 500,
  "message": "Failed to update MBTI."
}
```

---

## 🎯 有効なMBTIタイプ

以下の16種類のみが有効です（**大文字4文字**）:

### アナリスト型
- `INTJ` - 建築家
- `INTP` - 論理学者
- `ENTJ` - 指揮官
- `ENTP` - 討論者

### 外交官型
- `INFJ` - 提唱者
- `INFP` - 仲介者
- `ENFJ` - 主人公
- `ENFP` - 広報運動家

### 番人型
- `ISTJ` - 管理者
- `ISFJ` - 擁護者
- `ESTJ` - 幹部
- `ESFJ` - 領事

### 探検家型
- `ISTP` - 巨匠
- `ISFP` - 冒険家
- `ESTP` - 起業家
- `ESFP` - エンターテイナー

**重要:** 
- 小文字は受け付けません（`intj` → ❌）
- 必ず大文字で送信してください（`INTJ` → ✅）

---

## 💡 実装例（React + TypeScript）

### 1. 型定義

```typescript
// types/mbti.ts
export type MbtiType =
  | 'INTJ' | 'INTP' | 'ENTJ' | 'ENTP'
  | 'INFJ' | 'INFP' | 'ENFJ' | 'ENFP'
  | 'ISTJ' | 'ISFJ' | 'ESTJ' | 'ESFJ'
  | 'ISTP' | 'ISFP' | 'ESTP' | 'ESFP';

export const MBTI_TYPES: MbtiType[] = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

export const MBTI_LABELS: Record<MbtiType, string> = {
  INTJ: '建築家',
  INTP: '論理学者',
  ENTJ: '指揮官',
  ENTP: '討論者',
  INFJ: '提唱者',
  INFP: '仲介者',
  ENFJ: '主人公',
  ENFP: '広報運動家',
  ISTJ: '管理者',
  ISFJ: '擁護者',
  ESTJ: '幹部',
  ESFJ: '領事',
  ISTP: '巨匠',
  ISFP: '冒険家',
  ESTP: '起業家',
  ESFP: 'エンターテイナー',
};
```

---

### 2. APIクライアント

```typescript
// api/mbti.ts
import { MbtiType } from '../types/mbti';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function getMbti(accessToken: string): Promise<MbtiType | null> {
  const response = await fetch(`${API_BASE_URL}/users/mbti`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch MBTI: ${response.statusText}`);
  }

  const data = await response.json();
  return data.mbti;
}

export async function updateMbti(
  accessToken: string,
  mbti: MbtiType
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/mbti`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mbti }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update MBTI');
  }
}
```

---

### 3. Reactコンポーネント例

```typescript
// components/MbtiSelector.tsx
import React, { useState, useEffect } from 'react';
import { MBTI_TYPES, MBTI_LABELS, MbtiType } from '../types/mbti';
import { getMbti, updateMbti } from '../api/mbti';

interface MbtiSelectorProps {
  accessToken: string;
}

export const MbtiSelector: React.FC<MbtiSelectorProps> = ({ accessToken }) => {
  const [selectedMbti, setSelectedMbti] = useState<MbtiType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 初期値を取得
  useEffect(() => {
    const fetchMbti = async () => {
      try {
        const mbti = await getMbti(accessToken);
        setSelectedMbti(mbti);
      } catch (err) {
        console.error('Failed to fetch MBTI:', err);
      }
    };
    fetchMbti();
  }, [accessToken]);

  // MBTI更新
  const handleUpdate = async () => {
    if (!selectedMbti) {
      setError('MBTIタイプを選択してください');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await updateMbti(accessToken, selectedMbti);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mbti-selector">
      <h2>あなたのMBTIタイプ</h2>
      
      <select
        value={selectedMbti || ''}
        onChange={(e) => setSelectedMbti(e.target.value as MbtiType)}
        disabled={loading}
      >
        <option value="">選択してください</option>
        {MBTI_TYPES.map((type) => (
          <option key={type} value={type}>
            {type} - {MBTI_LABELS[type]}
          </option>
        ))}
      </select>

      <button onClick={handleUpdate} disabled={loading || !selectedMbti}>
        {loading ? '保存中...' : '保存'}
      </button>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">保存しました！</div>}
    </div>
  );
};
```

---

## 🎨 UI/UX推奨事項

### 1. **MBTI選択UI**
- ドロップダウン or カード選択式
- 各タイプの説明を表示すると親切
- 未選択状態も許容（null）

### 2. **配置場所**
- プロフィール設定ページ
- オンボーディングフロー（オプション）

### 3. **フィードバック**
- 保存成功時: トースト通知
- エラー時: エラーメッセージ表示
- ロード中: ローディングスピナー

### 4. **バリデーション**
- フロントエンドでも16種類の検証を実施
- 大文字変換を行う（ユーザーが小文字入力しても対応）

---

## 🐛 エラーハンドリング

```typescript
try {
  await updateMbti(accessToken, selectedMbti);
} catch (error) {
  if (error.message.includes('Unauthorized')) {
    // 認証エラー → ログイン画面へリダイレクト
    router.push('/login');
  } else if (error.message.includes('Forbidden')) {
    // 権限エラー → メンターはMBTI設定不可
    showError('メンターはMBTIを設定できません');
  } else if (error.message.includes('Invalid MBTI')) {
    // バリデーションエラー
    showError('無効なMBTIタイプです');
  } else {
    // その他のエラー
    showError('保存に失敗しました。もう一度お試しください。');
  }
}
```

---

## ✅ 実装チェックリスト

- [ ] 型定義（MbtiType）を追加
- [ ] APIクライアント関数を作成（getMbti, updateMbti）
- [ ] MBTI選択UIコンポーネントを作成
- [ ] プロフィール設定画面に統合
- [ ] エラーハンドリングを実装
- [ ] ローディング状態の表示
- [ ] 成功時のフィードバック
- [ ] 未設定（null）状態の対応
- [ ] バリデーション（16種類チェック）
- [ ] レスポンシブデザイン対応

---

## 🧪 テスト方法

### 1. ローカルでバックエンドを起動
```bash
cd retention-engine-server
npm run start:dev
# http://localhost:5000 で起動
```

### 2. APIテスト（curl）
```bash
# GET MBTI
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/users/mbti

# PUT MBTI
curl -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mbti":"INTJ"}' \
  http://localhost:5000/users/mbti
```

### 3. フロントエンドから確認
1. ログイン
2. プロフィール設定画面を開く
3. MBTIタイプを選択
4. 保存ボタンをクリック
5. リロードして値が保持されているか確認

---

## 📞 サポート

実装中に問題が発生した場合:
1. ブラウザのコンソールでエラーを確認
2. ネットワークタブでリクエスト/レスポンスを確認
3. バックエンドのログを確認

質問があればバックエンドチームに連絡してください。

---

## 🔄 更新履歴

- 2025-12-02: 初版作成
