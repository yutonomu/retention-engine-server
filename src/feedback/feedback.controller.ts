import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import type { Feedback } from './feedback.types';

interface CreateFeedbackRequestBody {
  messageId: string;
  authorId: string;
  content: string;
}

interface FeedbackListResponse {
  data: Feedback[];
}

interface CreateFeedbackResponse {
  data: Feedback;
}

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  getFeedbackByMessage(
    @Query('messageId') messageId: string,
  ): FeedbackListResponse {
    const result = this.feedbackService.getFeedbackByMessage(messageId);
    return { data: result.items };
  }

  @Post()
  createFeedback(
    @Body() dto: CreateFeedbackRequestBody,
  ): CreateFeedbackResponse {
    const feedback = this.feedbackService.createFeedback({
      messageId: dto.messageId,
      authorId: dto.authorId,
      content: dto.content,
    });
    return { data: feedback };
  }
}
