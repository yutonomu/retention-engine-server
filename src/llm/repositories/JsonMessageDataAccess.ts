import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { Message } from '../../Entity/Message';
import type { UUID } from '../../common/uuid';
import type { MessageDataAccessInterface } from './MessageDataAccessInterface.types';

type StoredMessage = Omit<Message, 'createdAt'> & { createdAt: string };
type StoredConversations = Record<string, StoredMessage[]>;

const DATA_FILE_PATH = path.resolve(
  process.cwd(),
  'src',
  'llm',
  'data',
  'jsonMessages.json',
);

@Injectable()
export class JsonMessageDataAccess implements MessageDataAccessInterface {
  async fetchMessages(conversationId: UUID): Promise<Message[]> {
    const conversations = await this.readConversations();
    const storedMessages = conversations[conversationId] ?? [];
    return storedMessages.map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt),
    }));
  }

  async saveMessages(conversationId: UUID, messages: Message[]): Promise<void> {
    const conversations = await this.readConversations();
    const serialized = messages.map<StoredMessage>((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    }));
    const existing = conversations[conversationId] ?? [];
    conversations[conversationId] = [...existing, ...serialized];
    await this.writeConversations(conversations);
  }

  private async readConversations(): Promise<StoredConversations> {
    try {
      const json = await fs.readFile(DATA_FILE_PATH, 'utf8');
      return JSON.parse(json) as StoredConversations;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        await this.writeConversations({});
        return {};
      }
      throw error;
    }
  }

  private async writeConversations(conversations: StoredConversations) {
    await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });
    await fs.writeFile(
      DATA_FILE_PATH,
      JSON.stringify(conversations, null, 2),
      'utf8',
    );
  }
}
