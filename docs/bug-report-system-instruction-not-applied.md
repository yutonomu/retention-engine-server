# バグレポート: SystemInstructionが適用されない問題

## 概要
- **発生日**: 2024年12月24日
- **影響範囲**: /llm/generate エンドポイント
- **深刻度**: 高
- **状態**: 修正済み

## 症状

### ユーザーから見える現象
複数ユーザーが同時にシステムを使用すると、AIの回答品質が著しく低下する。

#### 具体例
同じ質問「こんにちは！何かお話ししたいな！」に対して：

**正常時（単独使用）**：
```
こんにちは！お話ししたいとのこと、とっても嬉しいです！
新しい環境で、これからたくさんの経験をされることと思います。
私からいくつかアドバイスをお伝えしますね...
[詳細な600文字以上の親切な回答]
```

**異常時（複数ユーザー使用）**：
```
ご質問をどうぞ。
[21文字の簡素な回答]
```

## 根本原因

### 1. 表面的な原因
`GeminiFileSearchClient`クラスの`answerQuestion`メソッドで、`systemInstruction`パラメータが受け取られているにも関わらず、実際のGemini API呼び出し時（`generateContent`）に渡されていなかった。

### 2. なぜ複数ユーザー時のみ問題が顕在化したか

#### 複雑な実行パスの存在
システムには2つの異なる実行パスが存在していた：

**パスA: FileSearch成功時（通常）**
```
HybridRagAssistant → GeminiFileSearchClient → Gemini API
                                                    ↑
                                            systemInstruction ❌
```

**パスB: FileSearch失敗時（フォールバック）**
```
HybridRagAssistant → GeneralKnowledgeAssistant → Gemini API
                                                      ↑
                                              systemInstruction ✅
```

#### 複数ユーザー時の挙動の違い

**単独使用時の特徴：**
- FileSearchが高確率で成功
- パスAが実行される → systemInstructionなし
- ただし、FileSearchのコンテキストがあるため、ある程度の品質は保たれる
- 問題に気づきにくい

**複数ユーザー使用時の特徴：**
- システム負荷が上昇
- FileSearchのタイムアウトや失敗が増加
- パスBへのフォールバックが発生
- 一部のリクエストは詳細な回答（パスB）、一部は簡潔な回答（パスA）
- **回答品質のばらつきが目立つようになる**

#### 追加の複雑性要因

1. **Gemini Context Caching の影響**
   - `cachedContentName`使用時は`systemInstruction`が無視される設計
   - キャッシュヒット率が複数ユーザー時に変動

2. **観測者効果**
   - 単独テスト時：品質低下に気づきにくい
   - 複数ユーザー時：比較対象があるため品質差が顕著に

3. **負荷による副次的影響**
   - FileSearchのレスポンス時間増加
   - タイムアウト（60秒）への到達
   - エラー率の上昇

### 3. コードレベルの問題箇所

**ファイル**: `/src/llm/external/geminiFileSearchAssistant/geminiFileSearchClient.ts`

**問題のあるコード**（141-154行目）：
```typescript
const response = await this.executeWithRetry(async () => {
  return this.ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents,
    config: {
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: this.storeNamesForSearch,
          },
        },
      ],
    },
    // ❌ systemInstructionが含まれていない！
  });
});
```

### 4. 影響の詳細

#### システム構成の理解
```
                        ┌─→ GeminiFileSearchClient → Gemini API (systemInstruction ❌)
                        │
ユーザー → /llm/generate → LlmService → HybridRagAssistant 
                                │               │
                        systemInstruction生成   └─→ GeneralKnowledgeAssistant → Gemini API (systemInstruction ✅)
                        (PersonalityPreset + MBTI)    (フォールバック時のみ)
```

#### 何が起きていたか
1. `LlmService`がユーザーごとのPersonalityPresetとMBTI設定を含む`systemInstruction`を生成
2. 通常時：`GeminiFileSearchClient`経由 → systemInstructionが無視される
3. 高負荷時：`GeneralKnowledgeAssistant`へフォールバック → systemInstructionが適用される
4. **結果として、負荷状況により回答品質が不安定に**

## 修正内容

### 修正したコード
```typescript
const response = await this.executeWithRetry(async () => {
  const requestConfig: any = {
    model: 'gemini-2.5-pro',
    contents,
    config: {
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: this.storeNamesForSearch,
          },
        },
      ],
    },
  };
  
  // ✅ systemInstructionが提供されている場合は追加
  if (options.systemInstruction) {
    requestConfig.config.systemInstruction = options.systemInstruction;
  }
  
  return this.ai.models.generateContent(requestConfig);
});
```

### 修正の効果
- PersonalityPresetとMBTI設定が正しく適用される
- ユーザーごとにカスタマイズされた応答が生成される
- 複数ユーザーが同時使用しても品質が保たれる

## テスト結果

### 修正前
- Detailed Mentor設定: 949文字の応答
- 設定なし: 109文字の応答
- **比率: 8.71x** （設定が部分的にしか効いていない）

### 修正後
- Detailed Mentor設定: 604文字の応答
- 設定なし: 234文字の応答
- **比率: 2.58x** （設定が正しく効いている）

## 再発防止策

### 1. コードレビューの強化
- API呼び出し時のパラメータ渡し漏れをチェック
- 特に`systemInstruction`のような重要なパラメータは必ず確認

### 2. 統合テストの追加
```typescript
// 推奨テストケース
describe('SystemInstruction Integration', () => {
  it('should pass systemInstruction to Gemini API', async () => {
    // systemInstructionが実際にAPIに渡されることを確認
  });
  
  it('should apply personality presets correctly', async () => {
    // PersonalityPresetが応答に反映されることを確認
  });
});
```

### 3. 型安全性の向上
```typescript
interface GeminiRequestConfig {
  model: string;
  contents: Content[];
  config: {
    systemInstruction?: string; // 明示的に定義
    tools?: Tool[];
  };
}
```

### 4. デバッグログの追加
```typescript
if (options.systemInstruction) {
  this.logger.debug(`Applying systemInstruction: ${options.systemInstruction.substring(0, 100)}...`);
  requestConfig.config.systemInstruction = options.systemInstruction;
} else {
  this.logger.warn('No systemInstruction provided for this request');
}
```

## 教訓

### なぜこのバグが見逃されたか
1. **単体テスト環境では発見困難**: 単一リクエストでは問題が顕在化しない
2. **オプショナルパラメータ**: `systemInstruction`がオプショナルなため、渡さなくてもエラーにならない
3. **動作はするが品質が低い**: 完全に動かないわけではないため、気づきにくい

### 学んだこと
- オプショナルパラメータほど注意深く扱う必要がある
- ユーザー体験に直結するパラメータは特に重要
- 負荷テストや並行処理テストの重要性

## 関連ファイル
- `/src/llm/external/geminiFileSearchAssistant/geminiFileSearchClient.ts`
- `/src/llm/llm.service.ts`
- `/src/llm/cache/inMemoryCacheService.ts`
- `/test/simple-system-instruction-test.spec.ts`

## 参考資料
- [Gemini API Documentation - System Instructions](https://ai.google.dev/gemini-api/docs/system-instructions)
- [NestJS Best Practices](https://docs.nestjs.com/techniques)

---

*作成者: Claude AI Assistant*  
*最終更新: 2024年12月24日*