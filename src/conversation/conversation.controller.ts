import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Delete,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationService } from './conversation.service';
import type {
  GetActiveConversationListForMentorReturn,
  GetConversationListByNewHireReturn,
} from './conversation.types';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  // TODO: userIdやmentorIdをリクエストボディ/クエリではなく、req.userから取得するように修正する
  constructor(private readonly conversationService: ConversationService) { }

  @Get('mentor')
  async getMentorConversationList(
    @Query('mentorId') mentorId?: string,
  ): Promise<GetActiveConversationListForMentorReturn[]> {
    if (!mentorId) {
      throw new BadRequestException('mentorId is required');
    }
    return this.conversationService.getActiveConversationListForMentor(
      mentorId,
    );
  }

  @Get('newHire')
  async getConversationListByNewHire(
    @Query('userId') userId?: string,
  ): Promise<GetConversationListByNewHireReturn[]> {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    return this.conversationService.getConversationListByNewHire(userId);
  }

  @Post('newHire')
  async createConversationForNewHire(
    @Body()
    body: {
      userId?: string;
      title?: string;
      role?: string;
      displayName?: string;
      email?: string;
    },
  ): Promise<GetConversationListByNewHireReturn> {
    const userId = body.userId ?? '';
    const title = body.title ?? '';
    return this.conversationService.createConversationForNewHire(
      userId,
      title,
      body.role,
      body.displayName,
      body.email,
    );
  }

  @Delete('newHire')
  @HttpCode(204)
  async deleteConversationForNewHire(
    @Query('userId') userId?: string,
    @Query('convId') convId?: string,
  ): Promise<void> {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!convId) {
      throw new BadRequestException('convId is required');
    }

    await this.conversationService.deleteConversationForNewHire(
      userId,
      convId,
    );
  }
}
