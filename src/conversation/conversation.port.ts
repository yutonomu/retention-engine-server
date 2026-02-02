import type { Conversation, ConversationState, ConversationType } from './conversation.types';

export interface ConversationPort {
  create(ownerId: string, title: string, type?: ConversationType): Promise<Conversation>;
  findByOwner(ownerId: string): Promise<Conversation[]>;
  findByOwnerAndType(ownerId: string, type: ConversationType): Promise<Conversation[]>;
  findByState(state: ConversationState): Promise<Conversation[]>;
  findById(convId: string): Promise<Conversation | null>;
  findActiveByOwners(ownerIds: string[]): Promise<Conversation[]>;
  deleteById(convId: string): Promise<void>;
}

export const CONVERSATION_PORT = 'CONVERSATION_PORT';
