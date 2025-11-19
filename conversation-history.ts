export type TextConversationPart = {
  kind: "text";
  text: string;
};

export type ImageConversationPart = {
  kind: "image";
  mimeType: string;
  data: string; // base64 エンコード済みデータ
};

export type ConversationPart = TextConversationPart | ImageConversationPart;

export type ConversationTurn = {
  role: "user" | "model";
  parts: ConversationPart[];
};

export interface ConversationHistoryStore {
  load(conversationId: string): Promise<ConversationTurn[]>;
  append(conversationId: string, turns: ConversationTurn[]): Promise<void>;
}

export class InMemoryConversationHistoryStore
  implements ConversationHistoryStore
{
  private histories = new Map<string, ConversationTurn[]>();

  async load(conversationId: string): Promise<ConversationTurn[]> {
    return this.histories.get(conversationId) ?? [];
  }

  async append(
    conversationId: string,
    turns: ConversationTurn[]
  ): Promise<void> {
    const history = this.histories.get(conversationId) ?? [];
    this.histories.set(conversationId, [...history, ...turns]);
  }
}
