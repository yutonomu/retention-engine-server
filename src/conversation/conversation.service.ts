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
import { ConversationRepository } from './repositories/conversation.repository';
import { UserService } from '../user/user.service';
import { MentorAssignmentRepository } from '../mentor-assignment/mentor-assignment.repository';

@Injectable()
export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly userService: UserService,
    private readonly mentorAssignmentRepository: MentorAssignmentRepository,
  ) {}

  getConversationListByNewHire(
    userId: string,
  ): GetConversationListByNewHireReturn[] {
    if (!userId?.trim()) {
      throw new BadRequestException('userId is required');
    }
    const user = this.userService.findUserById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (user.role !== 'NEW_HIRE') {
      throw new ForbiddenException(
        'Only NEW_HIRE users can list their conversations.',
      );
    }

    const conversations = this.conversationRepository.findByOwner(user.user_id);

    return conversations.map((conversation) => {
      const response: GetConversationListByNewHireReturn = {
        conv_id: conversation.conv_id,
        title: conversation.title,
        created_at: conversation.created_at,
      };

      return response;
    });
  }

  createConversationForNewHire(
    userId: string,
    title: string,
  ): GetConversationListByNewHireReturn {
    if (!userId?.trim()) {
      throw new BadRequestException('userId is required');
    }
    const user = this.userService.findUserById(userId);
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

    const created = this.conversationRepository.create(
      user.user_id,
      trimmedTitle,
    );
    return {
      conv_id: created.conv_id,
      title: created.title,
      created_at: created.created_at,
    };
  }

  getActiveConversationListForMentor(
    mentorId: string,
  ): GetActiveConversationListForMentorReturn[] {
    if (!mentorId?.trim()) {
      throw new BadRequestException('mentorId is required');
    }
    const mentor = this.userService.findUserById(mentorId);
    if (!mentor) {
      throw new NotFoundException(`User ${mentorId} not found`);
    }
    if (mentor.role !== 'MENTOR') {
      throw new ForbiddenException(
        'Only MENTOR users can list assigned conversations.',
      );
    }

    const assignment = this.mentorAssignmentRepository.findByMentorId(mentorId);
    if (!assignment) {
      return [];
    }
    const conversations = this.conversationRepository.findActiveByOwners(
      assignment.newhire_ids,
    );

    return conversations.map((conversation) => {
      const response: GetActiveConversationListForMentorReturn = {
        conv_id: conversation.conv_id,
        title: conversation.title,
        created_at: conversation.created_at,
        owner_name:
          this.userService.findUserNameById(conversation.owner_id) ??
          'Unknown user',
      };
      return response;
    });
  }
}
