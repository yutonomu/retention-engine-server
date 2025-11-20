import type { Message } from '../../Entity/Message';
import type { UUID } from '../../common/uuid';

export interface MessageDataAccessInterface {
  fetchMessages(conversationId: UUID): Promise<Message[]>;
  saveMessages(conversationId: UUID, messages: Message[]): Promise<void>;
}
