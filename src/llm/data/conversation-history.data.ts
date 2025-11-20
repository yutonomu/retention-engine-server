import { createUUID } from '../../common/uuid';
import type { Message } from '../../Entity/Message';
import type { UUID } from '../../common/uuid';

const conversationIdOne = createUUID();
const conversationIdTwo = createUUID();

export const conversationHistoryData: Record<UUID, Message[]> = {
  [conversationIdOne]: [
    {
      messageId: createUUID(),
      conversationId: conversationIdOne,
      userRole: 'NEW_HIRE',
      content: '初日のオリエンテーションで気を付けることを教えてください。',
      createdAt: new Date('2024-01-01T10:00:00.000Z'),
    },
    {
      messageId: createUUID(),
      conversationId: conversationIdOne,
      userRole: 'ASSISTANT',
      content:
        'まずはチームメンバーの名前を覚え、相談しやすい関係を築きましょう。',
      createdAt: new Date('2024-01-01T10:05:00.000Z'),
    },
  ],
  [conversationIdTwo]: [
    {
      messageId: createUUID(),
      conversationId: conversationIdTwo,
      userRole: 'NEW_HIRE',
      content: '資料の提出期限はいつまででしたか？',
      createdAt: new Date('2024-01-02T09:00:00.000Z'),
    },
  ],
};
