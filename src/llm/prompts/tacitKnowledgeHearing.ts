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
  example?: string;
}

/**
 * ヒアリング継続結果
 */
export interface HearingContinuationResult {
  completenessScore: number;
  updatedKC: CompletedKC;
  needMoreInfo: boolean;
  nextQuestion: string | null;
  targetField: 'situation' | 'knowhow' | 'precaution' | null;
}

// ============================================
// プロンプト: トリガー検出 v2
// ============================================

export const TRIGGER_DETECTION_V2_INSTRUCTION = `
【暗黙知トリガー検出 v2 — 自動ヒアリングモード】

ユーザー（メンター）の発話を分析し、暗黙知として価値が高い発話を検出してください。
検出した場合、**自然な対話の中で**さらに情報を引き出す質問を含めてください。

■ 検出対象トリガー（5種類）:

1. REBUTTAL（反論・訂正・指摘）
   - AIの意見に対する反論・訂正・補足的指摘
   - シグナル: 「いや」「違う」「でも実際は」「現場では」「〜ではないですか」「〜と思いますが」「〜ですよね？」「〜とは限らない」「〜も考慮すべき」

2. SHARP_INSIGHT（鋭い指摘）
   - 具体的な数値・条件を含むノウハウ
   - シグナル: 数字、単位、「ポイントは」「コツは」「〜が重要」「〜に注意」

3. ALTERNATIVE_PERSPECTIVE（別の視点）
   - 別の方法・アプローチの提示、追加情報の提供
   - シグナル: 「うちでは」「僕の経験では」「こっちの方が」「他にも〜がある」「〜もありますよね」

4. EXPERIENCE_SHARING（経験共有）
   - 自発的な経験談、成功/失敗事例
   - シグナル: 「前に」「あのとき」「失敗した」「成功した」「実際にやってみると」

5. QUANTIFICATION（定量化）
   - 感覚を具体的数値で表現
   - シグナル: 「だいたい○○」「○○くらい」「目安として」

■ 検出時の対応:

1. まず**興味を示す自然な応答**を生成してください
2. 応答の中に、さらに深掘りする質問を**自然に含めて**ください
   - 押し付けがましくなく、「もっと聞きたい」という姿勢で
   - 例: 「なるほど！その判断基準、すごく気になります。具体的にはどんな条件で...?」

3. トリガータイプ別の初期質問テンプレート:
   - REBUTTAL: 「えっ、そうなんですか！」→ 反論の背景・状況を質問（例: 「それはどんな場面で気づいたんですか？」）
   - SHARP_INSIGHT: 「その数値、初めて聞きました！」→ 適用条件を質問（例: 「その基準はどんな条件のときに当てはまりますか？」）
   - ALTERNATIVE_PERSPECTIVE: 「別のやり方があるんですね！」→ 使用状況を質問（例: 「どんな場面でその方法を使いますか？」）
   - EXPERIENCE_SHARING: 「そんなことがあったんですね！」→ 具体的状況を質問（例: 「そのとき具体的にはどんな状況でしたか？」）
   - QUANTIFICATION: 「具体的な数値、ありがたいです！」→ 適用条件を質問（例: 「その数値はどんな条件で変わりますか？」）

   ※ 質問は必ず1つだけ。situationに焦点を当てること。

4. 応答の最後に、以下のJSON形式でトリガー検出結果を**必ず毎回**出力してください

■ 応答形式:

[自然な対話応答 — 興味を示しつつ後続質問を含める]

---TRIGGER_DETECTION_START---
{"detected":true,"triggerType":"EXPERIENCE_SHARING","confidence":0.85,"initialKC":{"title":"仮タイトル","situation":"","knowhow":"検出されたノウハウ","precaution":"","tags":[]},"hearingQuestion":"後続質問"}
---TRIGGER_DETECTION_END---

■ 重要ルール:
- **必ず毎回、応答の末尾にマーカーブロックを出力すること**（detected=trueでもfalseでも必ず出力）
- detected=false の場合: initialKC=null, hearingQuestion=null
- JSON は必ず1行で出力（改行なし）
- confidence < 0.7 の場合は detected=false
- ユーザーがAIの説明に対して補足・訂正・別の視点を提示した場合は、たとえ口調が柔らかくても積極的にトリガーとして検出すること
`.trim();

// ============================================
// ヒアリング戦略ヘルパー
// ============================================

/**
 * KCの中で最も情報が不足しているフィールドを判定
 */
function getWeakestField(partialKC: Partial<CompletedKC>): string {
  const situation = partialKC.situation ?? '';
  const knowhow = partialKC.knowhow ?? '';
  const precaution = partialKC.precaution ?? '';

  if (!situation || situation.length < 10) return 'situation';
  if (!knowhow || knowhow.length < 20) return 'knowhow';
  if (!precaution || precaution.length < 10) return 'precaution';

  return 'knowhow';
}

/**
 * ラウンドごとのヒアリング戦略を生成
 */
function getRoundStrategy(hearingRound: number, partialKC: Partial<CompletedKC>): string {
  switch (hearingRound) {
    case 1:
      return `
【ラウンド1戦略: situationの拡張プローブ】
ターゲット: situation（状況・背景）
目的: 「いつ・どこで・どんな時に」を明確にする

会話例:
  ユーザー: 「溶接の温度管理が大事なんだよ」
  あなた: 「なるほど、温度管理ですね！それはどんな現場で特に重要になりますか？例えば季節や材質で違いはありますか？」

質問方針: 「それはどんな現場で？」「どんな条件のときに？」
`;

    case 2:
      return `
【ラウンド2戦略: knowhowの明確化プローブ + CDM】
ターゲット: knowhow（具体的なノウハウ）
目的: 新人が読んで実践できるレベルまで具体化する

会話例:
  ユーザー: 「音を聞けば分かるんだよ」
  あなた: 「音で判断できるんですね！具体的にどこを見て…いや、聞いて判断しますか？正常な音と異常な音、どう違うんでしょう？」

質問方針: 「具体的にどこを見て判断？」「どんな手順で？」
`;

    case 3:
      return `
【ラウンド3戦略: precautionの反事実的質問】
ターゲット: precaution（注意点・失敗回避）
目的: やってはいけないこと、失敗パターンを引き出す

会話例:
  ユーザー: 「締め付けトルクは30Nmがベスト」
  あなた: 「30Nmですね。逆にそれをしなかったら、つまりトルクが足りなかったり強すぎたりしたら、どんなことが起きますか？」

質問方針: 「逆にそれをしなかったら？」「よくある失敗は？」
`;

    default: {
      const weakest = getWeakestField(partialKC);
      return `
【ラウンド${hearingRound}戦略: 最弱フィールドの補完 + 要約確認】
ターゲット: ${weakest}（最も情報が不足している項目）
目的: 不足情報を補完し、内容の確認を行う

会話例:
  あなた: 「ここまでお聞きした内容をまとめると、○○という場面で△△するのがポイントで、□□に注意する、ということですね。合っていますか？他に補足はありますか？」

質問方針: これまでの内容を簡潔に要約し、確認を求める。不足部分があれば自然に質問。
`;
    }
  }
}

// ============================================
// プロンプト: ヒアリング継続
// ============================================

/**
 * ヒアリング継続プロンプトを生成
 * @param accumulatedMessages これまでの会話履歴
 * @param partialKC 現在のKC状態
 * @param hearingRound 現在のラウンド数
 * @param triggerType トリガータイプ（オプション）
 */
export function buildHearingContinuationPrompt(
  accumulatedMessages: Array<{ role: string; content: string }>,
  partialKC: Partial<CompletedKC>,
  hearingRound: number,
  triggerType?: string,
): string {
  const messagesText = accumulatedMessages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n');

  const kcText = JSON.stringify(partialKC, null, 2);

  const roundStrategy = getRoundStrategy(hearingRound, partialKC);

  const situationStatus = partialKC.situation ? `✓ 記入あり（${partialKC.situation.length}文字）` : '✗ 空';
  const knowhowStatus = partialKC.knowhow ? `✓ 記入あり（${partialKC.knowhow.length}文字）` : '✗ 空';
  const precautionStatus = partialKC.precaution ? `✓ 記入あり（${partialKC.precaution.length}文字）` : '✗ 空';
  const exampleStatus = partialKC.example ? `✓ 記入あり（${partialKC.example.length}文字）` : '✗ 空';

  const triggerInfo = triggerType ? `\n■ トリガータイプ: ${triggerType}\n` : '';

  return `
【暗黙知ヒアリング継続 — ラウンド ${hearingRound}】

あなたは暗黙知の抽出を行っています。
**インタビューではなく自然な会話**として、ナレッジカード（KC）を構築・更新し、情報の充足度を判定してください。
${triggerInfo}
${roundStrategy}

■ 会話ルール:
1. 共感ファースト — まず相手の発言に共感・理解を示す
2. 1回1質問 — 質問は1つだけ。複数の質問を同時にしない
3. 理解確認型 — 「〜ということですね？」で内容を確認しながら進める

■ これまでの会話:
${messagesText}

■ 現在のKC状態:
${kcText}

■ 各フィールドの現在ステータス:
- situation: ${situationStatus}
- knowhow: ${knowhowStatus}
- precaution: ${precautionStatus}
- example: ${exampleStatus}

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
- completenessScore < 0.8 && ラウンド < 4 → 追加質問
- ラウンド ≥ 4 → 現状でKC完成（一部空欄許容）

■ 応答形式:

1. まず自然な対話応答を生成
   - 情報が十分なら: 感謝 + まとめの一言
   - 情報不足なら: 共感を示しつつ追加質問（1つだけ）

2. 応答末尾にJSON出力:

---HEARING_RESULT_START---
{"completenessScore":0.85,"updatedKC":{"title":"タイトル","situation":"状況","knowhow":"ノウハウ","precaution":"注意点","tags":["タグ1","タグ2"],"importance":"重要性","example":"具体的な事例"},"needMoreInfo":false,"nextQuestion":null,"targetField":null}
---HEARING_RESULT_END---

■ 注意:
- needMoreInfo=true の場合、nextQuestion に自然な追加質問を含める
- targetField にはこのラウンドで情報を引き出そうとしたフィールド名を設定（"situation" | "knowhow" | "precaution" | null）
- tags は会話から推測して3-5個生成
- importance は「なぜこの知識が新人に重要か」を一文で
- example は会話中に出てきた具体的な事例・エピソードがあれば記入
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
        example: parsed.updatedKC?.example ?? '',
      },
      needMoreInfo: Boolean(parsed.needMoreInfo),
      nextQuestion: parsed.nextQuestion ?? null,
      targetField: parsed.targetField ?? null,
    };
    return { cleanAnswer, result };
  } catch {
    // JSONパース失敗時もマーカーは除去
    return { cleanAnswer, result: undefined };
  }
}
