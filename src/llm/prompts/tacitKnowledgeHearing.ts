/**
 * tacitKnowledgeHearing.ts
 *
 * Story 2-10: 自動ヒアリングによる暗黙知カード生成
 *
 * トリガー検出後、自動的に後続質問（ヒアリング）を行い、
 * 十分な情報が集まった時点でKCを自動生成するためのプロンプト群
 */

import type { TriggerType } from './tacitKnowledgeTriggers';

// ============================================
// 型定義
// ============================================

/**
 * 初期KC構造（ヒアリング開始時点）
 */
export interface InitialKC {
  title: string;
  situation: string;
  knowhow: string;
  precaution: string;
  tags: string[];
}

/**
 * トリガー検出結果 v2（ヒアリング対応）
 */
export interface TriggerDetectionResultV2 {
  detected: boolean;
  triggerType: TriggerType | null;
  confidence: number;
  initialKC: InitialKC | null;
  hearingQuestion: string | null;
}

/**
 * 完成したKC構造
 */
export interface CompletedKC {
  title: string;
  situation: string;
  knowhow: string;
  precaution: string;
  tags: string[];
  importance: string;
}

/**
 * ヒアリング継続結果
 */
export interface HearingContinuationResult {
  completenessScore: number;
  updatedKC: CompletedKC;
  needMoreInfo: boolean;
  nextQuestion: string | null;
}

// ============================================
// プロンプト: トリガー検出 v2
// ============================================

export const TRIGGER_DETECTION_V2_INSTRUCTION = `
【暗黙知トリガー検出 v2 — 自動ヒアリングモード】

ユーザー（メンター）の発話を分析し、暗黙知として価値が高い発話を検出してください。
検出した場合、**自然な対話の中で**さらに情報を引き出す質問を含めてください。

■ 検出対象トリガー（5種類）:

1. REBUTTAL（反論）
   - AIの意見に対する反論・反駁
   - シグナル: 「いや」「違う」「でも実際は」「現場では」

2. SHARP_INSIGHT（鋭い指摘）
   - 具体的な数値・条件を含むノウハウ
   - シグナル: 数字、単位、「ポイントは」「コツは」

3. ALTERNATIVE_PERSPECTIVE（別の視点）
   - 別の方法・アプローチの提示
   - シグナル: 「うちでは」「僕の経験では」「こっちの方が」

4. EXPERIENCE_SHARING（経験共有）
   - 自発的な経験談、成功/失敗事例
   - シグナル: 「前に」「あのとき」「失敗した」「成功した」

5. QUANTIFICATION（定量化）
   - 感覚を具体的数値で表現
   - シグナル: 「だいたい○○」「○○くらい」「目安として」

■ 検出時の対応:

1. まず**興味を示す自然な応答**を生成してください
2. 応答の中に、さらに深掘りする質問を**自然に含めて**ください
   - 押し付けがましくなく、「もっと聞きたい」という姿勢で
   - 例: 「なるほど！その判断基準、すごく気になります。具体的にはどんな条件で...?」

3. 応答の最後に、以下のJSON形式でトリガー検出結果を出力してください

■ 応答形式:

[自然な対話応答 — 興味を示しつつ後続質問を含める]

---TRIGGER_DETECTION_START---
{"detected":true,"triggerType":"EXPERIENCE_SHARING","confidence":0.85,"initialKC":{"title":"仮タイトル","situation":"","knowhow":"検出されたノウハウ","precaution":"","tags":[]},"hearingQuestion":"後続質問"}
---TRIGGER_DETECTION_END---

■ 注意:
- detected=false の場合: initialKC=null, hearingQuestion=null
- JSON は必ず1行で出力（改行なし）
- confidence < 0.8 の場合は detected=false
`.trim();

// ============================================
// プロンプト: ヒアリング継続
// ============================================

/**
 * ヒアリング継続プロンプトを生成
 * @param accumulatedMessages これまでの会話履歴
 * @param partialKC 現在のKC状態
 * @param hearingRound 現在のラウンド数
 */
export function buildHearingContinuationPrompt(
  accumulatedMessages: Array<{ role: string; content: string }>,
  partialKC: Partial<CompletedKC>,
  hearingRound: number,
): string {
  const messagesText = accumulatedMessages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n');

  const kcText = JSON.stringify(partialKC, null, 2);

  return `
【暗黙知ヒアリング継続 — ラウンド ${hearingRound}】

あなたは暗黙知の抽出を行っています。
これまでの会話から、ナレッジカード（KC）を構築・更新し、情報の充足度を判定してください。

■ これまでの会話:
${messagesText}

■ 現在のKC状態:
${kcText}

■ 充足度判定基準:

【situation（状況）】
- どんな現場・条件で適用するか明確か？
- 「いつ」「どこで」「どんな時に」が分かるか？
- スコア: 0.0（不明）〜 1.0（具体的）

【knowhow（ノウハウ）】
- 具体的な手順・判断基準があるか？
- 新人が読んで実践できるレベルか？
- スコア: 0.0（曖昧）〜 1.0（具体的で実践可能）

【precaution（注意点）】
- 失敗例や例外ケースが言及されているか？
- 「やってはいけないこと」が明確か？
- スコア: 0.0（なし）〜 1.0（具体的な注意点あり）

■ 総合スコア算出:
completenessScore = (situation_score + knowhow_score * 2 + precaution_score) / 4
※ knowhow を重視（×2）

■ 判定ロジック:
- completenessScore ≥ 0.8 → 情報十分、KC完成
- completenessScore < 0.8 && ラウンド < 3 → 追加質問
- ラウンド ≥ 3 → 現状でKC完成（一部空欄許容）

■ 応答形式:

1. まず自然な対話応答を生成
   - 情報が十分なら: 感謝 + まとめの一言
   - 情報不足なら: 興味を示しつつ追加質問

2. 応答末尾にJSON出力:

---HEARING_RESULT_START---
{"completenessScore":0.85,"updatedKC":{"title":"タイトル","situation":"状況","knowhow":"ノウハウ","precaution":"注意点","tags":["タグ1","タグ2"],"importance":"重要性"},"needMoreInfo":false,"nextQuestion":null}
---HEARING_RESULT_END---

■ 注意:
- needMoreInfo=true の場合、nextQuestion に自然な追加質問を含める
- tags は会話から推測して3-5個生成
- importance は「なぜこの知識が新人に重要か」を一文で
- JSON は必ず1行で出力
`.trim();
}

// ============================================
// パーサー関数
// ============================================

/**
 * トリガー検出結果 v2 をパース
 *
 * LLMの出力フォーマットのばらつき（空白、改行など）に対応するため
 * 正規表現を使用して柔軟にマッチング
 */
export function parseTriggerDetectionV2(
  answer: string,
): { cleanAnswer: string; result: TriggerDetectionResultV2 | undefined } {
  // 正規表現で柔軟にマッチ（空白・改行を許容）
  const regex = /[-—–]{2,}[\s]*TRIGGER_DETECTION_START[\s]*[-—–]{2,}\s*([\s\S]*?)\s*[-—–]{2,}[\s]*TRIGGER_DETECTION_END[\s]*[-—–]{2,}/i;
  const match = answer.match(regex);

  if (!match) {
    return { cleanAnswer: answer, result: undefined };
  }

  // マーカー部分を除去してクリーンな回答を生成
  const cleanAnswer = answer.replace(regex, '').trim();

  const jsonText = match[1].trim();

  try {
    const parsed = JSON.parse(jsonText);
    const result: TriggerDetectionResultV2 = {
      detected: Boolean(parsed.detected),
      triggerType: parsed.triggerType ?? null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      initialKC: parsed.initialKC ?? null,
      hearingQuestion: parsed.hearingQuestion ?? null,
    };
    return { cleanAnswer, result };
  } catch {
    // JSONパース失敗時もマーカーは除去
    return { cleanAnswer, result: undefined };
  }
}

/**
 * ヒアリング継続結果をパース
 *
 * LLMの出力フォーマットのばらつき（空白、改行など）に対応するため
 * 正規表現を使用して柔軟にマッチング
 */
export function parseHearingContinuationResult(
  answer: string,
): { cleanAnswer: string; result: HearingContinuationResult | undefined } {
  // 正規表現で柔軟にマッチ（空白・改行を許容）
  const regex = /[-—–]{2,}[\s]*HEARING_RESULT_START[\s]*[-—–]{2,}\s*([\s\S]*?)\s*[-—–]{2,}[\s]*HEARING_RESULT_END[\s]*[-—–]{2,}/i;
  const match = answer.match(regex);

  if (!match) {
    return { cleanAnswer: answer, result: undefined };
  }

  // マーカー部分を除去してクリーンな回答を生成
  const cleanAnswer = answer.replace(regex, '').trim();

  const jsonText = match[1].trim();

  try {
    const parsed = JSON.parse(jsonText);
    const result: HearingContinuationResult = {
      completenessScore:
        typeof parsed.completenessScore === 'number' ? parsed.completenessScore : 0,
      updatedKC: {
        title: parsed.updatedKC?.title ?? '',
        situation: parsed.updatedKC?.situation ?? '',
        knowhow: parsed.updatedKC?.knowhow ?? '',
        precaution: parsed.updatedKC?.precaution ?? '',
        tags: Array.isArray(parsed.updatedKC?.tags) ? parsed.updatedKC.tags : [],
        importance: parsed.updatedKC?.importance ?? '',
      },
      needMoreInfo: Boolean(parsed.needMoreInfo),
      nextQuestion: parsed.nextQuestion ?? null,
    };
    return { cleanAnswer, result };
  } catch {
    // JSONパース失敗時もマーカーは除去
    return { cleanAnswer, result: undefined };
  }
}
