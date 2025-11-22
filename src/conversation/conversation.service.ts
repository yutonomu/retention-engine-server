import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GetActiveConversationListForMentorReturn,
  GetConversationListByNewHireReturn,
} from './conversation.types';
import { Inject } from '@nestjs/common';
import type { ConversationPort } from './conversation.port';
import { CONVERSATION_PORT } from './conversation.port';
import { USER_PORT } from '../user/user.port';
import type { UserPort } from '../user/user.port';
import { MENTOR_ASSIGNMENT_PORT } from '../mentor-assignment/mentor-assignment.port';
import type { MentorAssignmentPort } from '../mentor-assignment/mentor-assignment.port';

@Injectable()
export class ConversationService {
  constructor(
    @Inject(CONVERSATION_PORT)
    private readonly conversationRepository: ConversationPort,
    @Inject(USER_PORT)
    private readonly userRepository: UserPort,
    @Inject(MENTOR_ASSIGNMENT_PORT)
    private readonly mentorAssignmentRepository: MentorAssignmentPort,
  ) {}

  async getConversationListByNewHire(
    userId: string,
  ): Promise<GetConversationListByNewHireReturn[]> {
    if (!userId?.trim()) {
      throw new BadRequestException('userId is required');
    }
    const user = await this.userRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (user.role !== 'NEW_HIRE') {
      throw new ForbiddenException(
        'Only NEW_HIRE users can list their conversations.',
      );
    }

    const conversations = await this.conversationRepository.findByOwner(
      user.user_id,
    );

    return conversations.map((conversation) => {
      const response: GetConversationListByNewHireReturn = {
        conv_id: conversation.conv_id,
        title: conversation.title,
        created_at: conversation.created_at,
      };

      return response;
    });
  }

  async createConversationForNewHire(
    userId: string,
    title: string,
    role?: string,
    displayName?: string,
    email?: string,
  ): Promise<GetConversationListByNewHireReturn> {
    if (!userId?.trim()) {
      throw new BadRequestException('userId is required');
    }
    const user =
      (await this.userRepository.findUserById(userId)) ??
      (() => {
        if (!role || role === 'NEW_HIRE') {
          // upsert placeholder user
          void this.userRepository.upsertUser({
            user_id: userId,
            role: 'NEW_HIRE',
            display_name: displayName ?? email ?? userId,
            email: email ?? '',
            created_at: new Date(),
          });
          return {
            user_id: userId,
            role: 'NEW_HIRE' as const,
            display_name: displayName ?? email ?? userId,
            email: email ?? '',
            created_at: new Date(),
          };
        }
        return undefined;
      })();
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (user.role !== 'NEW_HIRE') {
      throw new ForbiddenException(
        'Only NEW_HIRE users can create conversations.',
      );
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new BadRequestException('title must not be empty');
    }
    if (trimmedTitle.length > 120) {
      throw new BadRequestException(
        'title must be 120 characters or fewer',
      );
    }

    const created = await this.conversationRepository.create(
      user.user_id,
      trimmedTitle,
    );
    return {
      conv_id: created.conv_id,
      title: created.title,
      created_at: created.created_at,
    };
  }

  async getActiveConversationListForMentor(
    mentorId: string,
  ): Promise<GetActiveConversationListForMentorReturn[]> {
    if (!mentorId?.trim()) {
      throw new BadRequestException('mentorId is required');
    }
    const mentor = await this.userRepository.findUserById(mentorId);
    if (!mentor) {
      throw new NotFoundException(`User ${mentorId} not found`);
    }
    if (mentor.role !== 'MENTOR') {
      throw new ForbiddenException(
        'Only MENTOR users can list assigned conversations.',
      );
    }

    const assignment = await this.mentorAssignmentRepository.findByMentorId(
      mentorId,
    );
    if (!assignment) {
      return [];
    }
    const conversations = await this.conversationRepository.findActiveByOwners(
      assignment.newhire_ids,
    );

    const results = await Promise.all(
      conversations.map(async (conversation) => {
        const ownerName =
          (await this.userRepository.findUserNameById(conversation.owner_id)) ??
          'Unknown user';
        return {
          conv_id: conversation.conv_id,
          title: conversation.title,
          created_at: conversation.created_at,
          owner_name: ownerName,
        } satisfies GetActiveConversationListForMentorReturn;
      }),
    );
    return results;
  }
}
