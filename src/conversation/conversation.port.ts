import type { Conversation, ConversationState } from './conversation.types';

export interface ConversationPort {
  create(ownerId: string, title: string): Promise<Conversation>;
  findByOwner(ownerId: string): Promise<Conversation[]>;
  findByState(state: ConversationState): Promise<Conversation[]>;
  findById(convId: string): Promise<Conversation>;
  findActiveByOwners(ownerIds: string[]): Promise<Conversation[]>;
  deleteById(convId: string): Promise<void>;
}

export const CONVERSATION_PORT = 'CONVERSATION_PORT';
