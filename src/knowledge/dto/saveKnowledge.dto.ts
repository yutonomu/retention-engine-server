export interface SaveKnowledgeItemDto {
  content: string;
  category: string;
  tags: string[];
}

export interface SaveKnowledgeDto {
  conversationId: string;
  items: SaveKnowledgeItemDto[];
}

/** Service層で使う内部リクエスト（userIdを含む） */
export interface SaveKnowledgeRequest {
  conversationId: string;
  items: SaveKnowledgeItemDto[];
  userId: string;
}
