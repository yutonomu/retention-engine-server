/**
 * constructionDomainPatterns.ts
 *
 * 建設現場の主要工種別・暗黙知パターンライブラリ
 * メンターAI対話のfew-shot例として使用
 *
 * 各工種は2つの深掘り軸を持つ:
 *   - sensoryToQuantitative: 感覚的表現 → 定量値への変換
 *   - implicitConditions: 暗黙的条件 → 明示的条件への変換
 */

export type TacitKnowledgeExample = {
  /** メンターの発話例 */
  mentorSays: string;
  /** AIの深掘り質問例 */
  aiFollowup: string;
};

export type ConstructionCategory = {
  /** カテゴリの日本語ラベル */
  label: string;
  /** 感覚→定量変換の例 */
  sensoryToQuantitative?: TacitKnowledgeExample[];
  /** 暗黙的条件→明示化の例 */
  implicitConditions?: TacitKnowledgeExample[];
};

/**
 * 建設現場の暗黙知パターン集
 */
export const CONSTRUCTION_TACIT_KNOWLEDGE_EXAMPLES: Record<
  string,
  ConstructionCategory
> = {
  concreteWork: {
    label: 'コンクリート打設',
    sensoryToQuantitative: [
      {
        mentorSays: '表面を触って、ちょうどいい粘り気があれば大丈夫',
        aiFollowup:
          'その「ちょうどいい粘り気」をスランプ値で表すと、おおよそ何cmくらいでしょうか？',
      },
      {
        mentorSays: '雨が降るとコンクリート表面の水分が気になるんだよね',
        aiFollowup:
          '表面の水分量を判断するとき、目安にしている基準はありますか？例えば、水膜の厚さや光り具合など。',
      },
    ],
    implicitConditions: [
      {
        mentorSays: '夏場は早めに散水養生を始めるんだ',
        aiFollowup:
          '気温何度以上の場合に早めますか？打設後何分くらいから始めますか？',
      },
      {
        mentorSays: 'バイブレーターは長くかけすぎないようにしてる',
        aiFollowup:
          '1箇所あたりの目安は何秒くらいですか？かけすぎの判断基準はありますか？',
      },
    ],
  },

  formwork: {
    label: '型枠工事',
    sensoryToQuantitative: [
      {
        mentorSays: '型枠のたわみは見た感じで分かるんだよ',
        aiFollowup:
          '「見た感じ」で判断する場合、たわみ量は大体何mmくらいからNGと判断しますか？',
      },
    ],
    implicitConditions: [
      {
        mentorSays: 'コンクリートの強度が出たら脱型していい',
        aiFollowup:
          '「強度が出た」の具体的な基準は何N/mm²ですか？季節や部位で基準は変わりますか？',
      },
      {
        mentorSays: '型枠のセパレーターは適当な間隔で入れてる',
        aiFollowup:
          '「適当な間隔」は具体的に何mmくらいですか？壁の高さやコンクリートの側圧で変えますか？',
      },
    ],
  },

  rebar: {
    label: '鉄筋工事',
    sensoryToQuantitative: [
      {
        mentorSays: '鉄筋のかぶり厚さは手を入れてみれば分かる',
        aiFollowup:
          '手を入れて確認する場合、指何本分くらいを目安にしていますか？設計上の最小かぶりは何mmですか？',
      },
    ],
    implicitConditions: [
      {
        mentorSays: '配筋が密な箇所はちょっと工夫が必要なんだ',
        aiFollowup:
          '鉄筋間隔が何mm以下になると「密」と感じますか？具体的にどんな工夫をされますか？',
      },
      {
        mentorSays: '継手の位置は同じところに集めないようにしてる',
        aiFollowup:
          '継手をずらす場合、最低何d（鉄筋径の倍数）以上離しますか？断面の何割までなら同一箇所に許容しますか？',
      },
    ],
  },

  curing: {
    label: '養生',
    sensoryToQuantitative: [
      {
        mentorSays: 'コンクリートの表面が乾いてきたらすぐに散水するんだ',
        aiFollowup:
          '「乾いてきた」の判断は表面の色味ですか？それとも触った感触ですか？具体的にどんな状態になったら散水しますか？',
      },
    ],
    implicitConditions: [
      {
        mentorSays: '冬場はちょっと長めに養生するんだ',
        aiFollowup:
          '何度以下の場合に養生期間を延ばしますか？通常と比べてどのくらい長くしますか？',
      },
      {
        mentorSays: '風が強い日は養生シートをしっかり固定する',
        aiFollowup:
          '風速何m/s以上で特別な対策をしますか？固定方法は通常と具体的にどう変えますか？',
      },
    ],
  },
};
