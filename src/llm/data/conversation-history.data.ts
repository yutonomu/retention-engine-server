import type { ConversationTurn } from '../llm.service';

export const conversationHistoryData: Record<string, ConversationTurn[]> = {
  'conv-001': [
    {
      role: 'user',
      parts: [
        {
          kind: 'text',
          text: '初日のオリエンテーションで気を付けることを教えてください。',
        },
      ],
    },
    {
      role: 'model',
      parts: [
        {
          kind: 'text',
          text: 'まずはチームメンバーの名前を覚え、相談しやすい関係を築きましょう。',
        },
      ],
    },
  ],
  'conv-002': [
    {
      role: 'user',
      parts: [
        {
          kind: 'text',
          text: '資料の提出期限はいつまででしたか？',
        },
      ],
    },
  ],
};
