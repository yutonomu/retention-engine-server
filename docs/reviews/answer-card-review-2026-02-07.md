# 質問カード（Answer Card）機能 コードレビュー

**日時**: 2026-02-07
**対象コミット**: `5894443`（Backend）/ `02d5d9f`（Frontend）
**レビュアー**: Claude (AI Code Review)

---

## 全体評価

アーキテクチャ設計（Hexagonal Architecture / Clean Architecture）は非常にきれいで、3段階フロー（チャット → プレビュー → 完了）のUXも自然です。ストリーミング実装の品質も高く、`requestAnimationFrame`ベースのバッチレンダリングでパフォーマンス最適化されています。

ただし、**セキュリティ1件**と**バグ1件**の修正が必要です。

---

## CRITICAL（修正必須）

### C-1: 検索パラメータのエスケープ不足

**ファイル**: `answer-card.repository.ts:99`, `knowledge.repository.ts:129`

```typescript
// 現在のコード
if (query.search) {
  qb = qb.or(`content.ilike.%${query.search}%`);
}
```

**問題**: `query.search`がSupabaseフィルタ文字列にそのまま挿入されています。`%`, `_`, `,`, `.`などの特殊文字がエスケープされないため、PostgRESTフィルタの操作が可能です。

**修正案**:
```typescript
function escapeFilterValue(value: string): string {
  return value.replace(/[%_]/g, '\\$&').replace(/[,.()]/g, '');
}

if (query.search) {
  const safe = escapeFilterValue(query.search);
  qb = qb.or(`content.ilike.%${safe}%`);
}
```

---

### C-2: updateエンドポイントが常にundefined

**ファイル**: `answer-card.controller.ts:190-191`

```typescript
// 現在のコード（バグ）
const updated = await this.answerCardService.updateAnswerCard(id, {
  content: dto.candidate ? undefined : undefined,  // ← 両方 undefined
});
```

**問題**: 三項演算の両側が`undefined`のため、PATCHエンドポイントは何も更新しません。

**修正案**:
```typescript
const updated = await this.answerCardService.updateAnswerCard(id, {
  content: dto.candidate
    ? composeKCContent(dto.candidate)
    : undefined,
});
```

---

## MAJOR（早めに対応推奨）

### M-1: SSEクライアント切断未処理

**ファイル**: `answer-card.controller.ts:42-57`

クライアントが途中で接続を切っても`for await`ループがAI応答を最後まで消費し続けるため、**不要なAPI費用が発生**します。

**修正案**:
```typescript
const abortController = new AbortController();
res.on('close', () => abortController.abort());

for await (const event of this.answerCardService.generateStream(dto, abortController.signal)) {
  if (abortController.signal.aborted) break;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
```

---

### M-2: Gateway URL パターン不一致

**ファイル**: `AnswerCardGateway.ts`

| エンドポイント | 現在のURL | 問題 |
|---------------|----------|------|
| streaming | `/api/answer-cards/generate/stream` | 相対パス ✓ |
| generate | `${this.baseUrl}/answer-cards/generate` | 絶対パス ✗ |
| CRUD系 | `${this.baseUrl}/answer-cards/...` | 絶対パス ✗ |

`KnowledgeGateway`は全て`/api/...`相対パスに統一済み。`AnswerCardGateway`も同様に統一すべきです。

---

### M-3: DTO Validation不足

**ファイル**: `answer-card.controller.ts`

`GenerateAnswerRequest`が`interface`のみで`class-validator`デコレータがないため、`ValidationPipe`が効きません。`chatHistory`の長さ制限がないと、悪意あるリクエストでGemini APIコストが膨らむリスクがあります。

---

## MINOR（余裕があれば）

| # | 内容 | ファイル |
|---|------|---------|
| m-1 | `useCallback`依存配列に`questionCardId`が不足 | `useAnswerCardChatPresenter.ts:191` |
| m-2 | `parseKCContent`と`SECTION_CONFIG`が3ファイルで重複定義 | `QuestionCardDetailDialog.tsx`, `KCLibraryView.tsx`, `AnswerCardPreview.tsx` |
| m-3 | `catch {}`でエラーを完全無視している箇所が複数 | `QuestionCardDetailDialog.tsx:124`, `useAnswerCardChatPresenter.ts:141,164` |

---

## 良い点

- Hexagonal Architecture（Port/Adapter）のパターンを正しく適用
- Clean Architecture（Gateway → Presenter → View）の分離がきれい
- `requestAnimationFrame`ベースのバッチレンダリングで効率的
- 既存の`KnowledgeService.saveKnowledgeCard()`に委譲して重複回避
- マイグレーションのトリガーによる`answer_count`自動更新が賢い
- importance/exampleフィールドとの**互換性問題なし**

---

## 対応優先度

| 優先度 | 件数 | 対応目安 |
|--------|------|---------|
| 🔴 CRITICAL | 2件 | マージ前に修正 |
| 🟡 MAJOR | 3件 | 今週中 |
| 🟢 MINOR | 3件 | 次スプリント |
