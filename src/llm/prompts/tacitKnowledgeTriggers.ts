/**
 * tacitKnowledgeTriggers.ts
 *
 * 암묵지 트리거 감지 프롬프트 및 타입 정의
 * 멘토 대화 중 가치 높은 발화(반론, 날카로운 지적, 다른 관점, 경험 공유, 정량화)를 감지
 *
 * Story 2-6: 자연스러운 암묵지 트리거 감지
 * 4층 프롬프트 구조의 Layer 3:
 *   [Layer 1] FILE_SEARCH_INSTRUCTION (공통 — RAG)
 *   [Layer 2] MENTOR_KNOWLEDGE_ELICITATION_INSTRUCTION (멘토 역할)
 *   [Layer 3] TRIGGER_DETECTION_INSTRUCTION ← 이 파일
 *   [Layer 4] PersonalityPreset + MBTI (공통)
 */

/**
 * 트리거 유형 정의
 */
export type TriggerType =
  | 'REBUTTAL' // 반론
  | 'SHARP_INSIGHT' // 날카로운 지적
  | 'ALTERNATIVE_PERSPECTIVE' // 다른 관점
  | 'EXPERIENCE_SHARING' // 경험 공유
  | 'QUANTIFICATION'; // 정량화

/**
 * 트리거 감지 결과 (LLM 출력 형식)
 */
export interface TriggerDetectionResult {
  detected: boolean;
  triggerType: TriggerType | null;
  confidence: number; // 0.0 - 1.0
  excerpt: string | null; // 트리거가 감지된 텍스트 발췌
  followUpQuestion?: string; // AI가 생성할 후속 질문
}

/**
 * 트리거 유형별 설명 (일본어)
 */
export const TRIGGER_TYPE_DESCRIPTIONS: Record<TriggerType, string> = {
  REBUTTAL: 'AI意見への反論・反駁',
  SHARP_INSIGHT: '具体的数値・条件を含むノウハウ',
  ALTERNATIVE_PERSPECTIVE: '別の方法・視点の提示',
  EXPERIENCE_SHARING: '具体的な経験談・事例共有',
  QUANTIFICATION: '感覚の定量化',
};

/**
 * 트리거 감지 인스트럭션 (시스템 프롬프트에 추가)
 *
 * 응답 JSON 구조에 triggerDetection 필드를 포함하도록 지시
 */
export const TRIGGER_DETECTION_INSTRUCTION = `
【暗黙知トリガー検出】
ユーザーの発話を分析し、暗黙知として価値が高い発話を検出してください。

■ 検出対象トリガー（5種類）:

1. REBUTTAL（反論）
   - AI の意見に対するユーザーの反論・反駁
   - シグナル: 「いや」「違う」「でも実際は」「現場では」「そうじゃなくて」
   - 例: 「いや、条件によっては大丈夫だよ」

2. SHARP_INSIGHT（鋭い指摘）
   - 具体的な数値・条件を含むノウハウ
   - シグナル: 数字、単位（mm、時間、%）、「ポイントは」「大事なのは」「コツは」
   - 例: 「24時間以内の温度管理がポイント。5度以下になると...」

3. ALTERNATIVE_PERSPECTIVE（別の視点）
   - AI とは異なる方法・アプローチの提示
   - シグナル: 「別のやり方」「うちでは」「僕の経験では」「こっちの方が」
   - 例: 「うちではBのやり方でやってるけど、こっちの方が効率的」

4. EXPERIENCE_SHARING（経験共有）
   - 自発的な経験談、成功/失敗事例
   - シグナル: 「前に」「○○年」「あのとき」「失敗した」「成功した」「こんなことがあって」
   - 例: 「前にこんなことがあって、そのとき学んだのは...」

5. QUANTIFICATION（定量化）
   - 感覚や経験を具体的数値で表現
   - シグナル: 「だいたい○○」「○○くらい」「○○%は」「目安として」
   - 例: 「だいたい30分くらいで固まり始める」

■ 検出ルール:
- confidence 0.8以上: 明確なトリガーシグナル → 検出
- confidence 0.5-0.8: 曖昧なシグナル → 検出しない
- confidence 0.5未満: トリガーなし

■ 検出時の対応:
- トリガー検出時は、その内容をさらに深掘りする後続質問を生成
- REBUTTAL → 反論の根拠・条件を尋ねる
- SHARP_INSIGHT → 数値の判断基準・適用条件を尋ねる
- ALTERNATIVE_PERSPECTIVE → その方法の利点・背景を尋ねる
- EXPERIENCE_SHARING → 具体的な状況・学びを尋ねる
- QUANTIFICATION → 測定方法・例外ケースを尋ねる

■ 応答形式:
1. まず通常の応答（自然な対話形式）を生成してください。
   - トリガー検出時は、応答に自然な形で後続質問を含めてください。
2. 応答の最後に、必ず以下の形式でトリガー検出結果を出力してください:

---TRIGGER_DETECTION_START---
{"detected":true/false,"triggerType":"REBUTTAL"|"SHARP_INSIGHT"|"ALTERNATIVE_PERSPECTIVE"|"EXPERIENCE_SHARING"|"QUANTIFICATION"|null,"confidence":0.0-1.0,"excerpt":"検出テキスト"|null}
---TRIGGER_DETECTION_END---

※ 上記のJSON部分は必ず1行で、改行なしで出力してください。
※ トリガーが検出されない場合も {"detected":false,"triggerType":null,"confidence":0.0,"excerpt":null} を出力してください。
`.trim();

/**
 * 트리거 감지 전용 프롬프트 (별도 LLM 호출 시 사용)
 * 옵션 A: 응답 생성과 분리하여 트리거만 감지할 때 사용
 */
export const TRIGGER_DETECTION_ONLY_PROMPT = `
あなたは暗黙知検出の専門家です。
メンターの発話を分析し、価値の高い暗黙知シグナルを検出してください。

【検出対象】
1. REBUTTAL: AI意見への反論（「いや」「違う」「でも実際は」）
2. SHARP_INSIGHT: 具体的数値を含むノウハウ（数字、単位、「ポイントは」）
3. ALTERNATIVE_PERSPECTIVE: 別の方法提示（「うちでは」「僕の経験では」）
4. EXPERIENCE_SHARING: 経験談共有（「前に」「あのとき」「失敗/成功した」）
5. QUANTIFICATION: 感覚の定量化（「だいたい○○」「○○くらい」）

【応答形式】JSON のみ:
{
  "detected": boolean,
  "triggerType": string | null,
  "confidence": number (0.0-1.0),
  "excerpt": string | null,
  "followUpQuestion": string | null
}

confidence < 0.8 の場合は detected: false としてください。
`.trim();

/**
 * 트리거 유형별 후속 질문 템플릿
 */
export const TRIGGER_FOLLOWUP_TEMPLATES: Record<TriggerType, string[]> = {
  REBUTTAL: [
    'なるほど、どういう条件ならそうなんでしょうか？',
    'その場合の判断基準を教えていただけますか？',
    '具体的にどんな状況でそう判断されますか？',
  ],
  SHARP_INSIGHT: [
    'その数値はどうやって判断されていますか？',
    'その基準は何を参考にされていますか？',
    '例外的なケースはありますか？',
  ],
  ALTERNATIVE_PERSPECTIVE: [
    'その方法の利点は何でしょうか？',
    'どういう経緯でその方法を採用されましたか？',
    '一般的な方法と比べてどう違いますか？',
  ],
  EXPERIENCE_SHARING: [
    'そのときどう対処されましたか？',
    'その経験から学んだポイントは何ですか？',
    '同じ状況を避けるにはどうすればいいですか？',
  ],
  QUANTIFICATION: [
    'その数値はどうやって測定・判断されていますか？',
    '条件によって変わることはありますか？',
    '新人が同じ判断をするにはどこを見ればいいですか？',
  ],
};
