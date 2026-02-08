import {
  Body,
  Controller,
  Logger,
  Post,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { llmGenerateRequestSchema } from './dto/llmGenerateRequest.dto';
import type { LlmGenerateRequestDto } from './dto/llmGenerateRequest.dto';
import { ZodValidationPipe } from '../common/pipes/zodValidation.pipe';
import {
  LlmService,
  type LlmGenerateCommand,
  type MentorLlmGenerateCommand,
  type UploadDocumentCommand,
} from './llm.service';
import type { UUID } from '../common/uuid';

interface UploadDocumentRequestBody {
  filePath: string;
  displayName?: string;
  mimeType?: string;
}

@Controller('llm')
@UseGuards(JwtAuthGuard)
export class LlmController {
  private readonly logger = new Logger(LlmController.name);

  constructor(private readonly llmService: LlmService) {}

  @UsePipes(new ZodValidationPipe(llmGenerateRequestSchema))
  @Post('generate')
  async generate(@Body() payload: LlmGenerateRequestDto) {
    // デバッグ: リクエストIDを生成して重複処理を検出
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const stackTrace = new Error().stack?.split('\n').slice(1, 5).join('\n');

    this.logger.log(
      `[${requestId}] Received LLM generate request: ` +
        `question="${payload.question.substring(0, 50)}..." ` +
        `webSearch=${payload.requireWebSearch} ` +
        `conversationId=${payload.conversationId} ` +
        `timestamp=${new Date().toISOString()}`,
    );

    this.logger.debug(`[${requestId}] Request stack trace: ${stackTrace}`);

    const command: LlmGenerateCommand = {
      prompt: payload.question,
      conversationId: payload.conversationId as UUID,
      requireWebSearch: payload.requireWebSearch ?? false,
    };

    const result = await this.llmService.generate(command);

    const totalSources =
      (result.sources?.fileSearch?.length ?? 0) +
      (result.sources?.webSearch?.length ?? 0);

    this.logger.log(
      `[${requestId}] Completed LLM generate request: ` +
        `type=${result.type} ` +
        `answerLength=${result.answer.length} ` +
        `sourcesCount=${totalSources}`,
    );

    return {
      type: result.type,
      answer: result.answer,
      sources: result.sources,
    };
  }

  @UsePipes(new ZodValidationPipe(llmGenerateRequestSchema))
  @Post('mentor/generate')
  async mentorGenerate(@Body() payload: LlmGenerateRequestDto) {
    this.logger.log(
      `[MentorAI] Received generate request: ` +
        `question="${payload.question.substring(0, 50)}..." ` +
        `conversationId=${payload.conversationId}`,
    );

    const command: MentorLlmGenerateCommand = {
      prompt: payload.question,
      conversationId: payload.conversationId as UUID,
    };

    const result = await this.llmService.generateForMentor(command);

    // Story 2-6: トリガー検出結果をログに記録
    if (result.triggerDetection?.detected) {
      this.logger.log(
        `[MentorAI] Trigger detected: type=${result.triggerDetection.triggerType} ` +
          `confidence=${result.triggerDetection.confidence} ` +
          `excerpt="${result.triggerDetection.excerpt?.substring(0, 30)}..."`,
      );
    }

    // Story 2-10: トリガーセッション状態をログに記録
    if (result.triggerSession) {
      this.logger.log(
        `[MentorAI] TriggerSession: id=${result.triggerSession.id} ` +
          `status=${result.triggerSession.status} ` +
          `round=${result.triggerSession.hearingRound}`,
      );
    }

    return {
      type: result.type,
      answer: result.answer,
      sources: result.sources,
      // Story 2-6: 暗黙知トリガー検出結果
      triggerDetection: result.triggerDetection,
      // Story 2-10: 自動ヒアリングセッション状態
      triggerSession: result.triggerSession,
    };
  }

  @UsePipes(new ZodValidationPipe(llmGenerateRequestSchema))
  @Post('mentor/generate/stream')
  async mentorGenerateStream(
    @Body() payload: LlmGenerateRequestDto,
    @Res() res: Response,
  ) {
    this.logger.log(
      `[MentorAI:Stream] Received mentor stream request: ` +
        `question="${payload.question.substring(0, 50)}..." ` +
        `conversationId=${payload.conversationId}`,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const command: MentorLlmGenerateCommand = {
      prompt: payload.question,
      conversationId: payload.conversationId as UUID,
    };

    try {
      for await (const event of this.llmService.generateForMentorStream(
        command,
      )) {
        // トリガー検出結果をログに記録
        if (event.type === 'trigger') {
          try {
            const triggerData = JSON.parse(event.data);
            if (triggerData.detected) {
              this.logger.log(
                `[MentorAI:Stream] Trigger detected: type=${triggerData.triggerType} ` +
                  `confidence=${triggerData.confidence}`,
              );
            }
          } catch {
            // ログ用パースの失敗は無視
          }
        }

        if (event.type === 'session') {
          try {
            const sessionData = JSON.parse(event.data);
            this.logger.log(
              `[MentorAI:Stream] TriggerSession: id=${sessionData.id} ` +
                `status=${sessionData.status} ` +
                `round=${sessionData.hearingRound}`,
            );
          } catch {
            // ログ用パースの失敗は無視
          }
        }

        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      this.logger.error(
        '[MentorAI:Stream] Unexpected error during streaming',
        error,
      );
      const errorEvent = {
        type: 'error',
        data: '予期しないエラーが発生しました。',
        metadata: {
          error: {
            code: 'INTERNAL_ERROR',
            message:
              error instanceof Error ? error.message : 'Unknown error',
            retryable: true,
          },
        },
      };
      res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    } finally {
      res.end();
    }
  }

  @UsePipes(new ZodValidationPipe(llmGenerateRequestSchema))
  @Post('generate/stream')
  async generateStream(
    @Body() payload: LlmGenerateRequestDto,
    @Res() res: Response,
  ) {
    this.logger.log(
      `[Stream] Received LLM stream request: ` +
        `question="${payload.question.substring(0, 50)}..." ` +
        `webSearch=${payload.requireWebSearch} ` +
        `conversationId=${payload.conversationId}`,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const command: LlmGenerateCommand = {
      prompt: payload.question,
      conversationId: payload.conversationId as UUID,
      requireWebSearch: payload.requireWebSearch ?? false,
    };

    try {
      for await (const event of this.llmService.generateStream(command)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      this.logger.error('[Stream] Unexpected error during streaming', error);
      const errorEvent = {
        type: 'error',
        data: '予期しないエラーが発生しました。',
        metadata: {
          error: {
            code: 'INTERNAL_ERROR',
            message:
              error instanceof Error ? error.message : 'Unknown error',
            retryable: true,
          },
        },
      };
      res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    } finally {
      res.end();
    }
  }

  @Post('documentUpload')
  async documentUpload(@Body() payload: UploadDocumentRequestBody) {
    // TODO: リクエスト経由のファイルアップロードを実装し、受け取ったファイルをストレージ保存後に documentUploadRepository へ登録する
    const command: UploadDocumentCommand = {
      filePath: payload.filePath,
      displayName: payload.displayName,
      mimeType: payload.mimeType,
    };
    await this.llmService.uploadDocument(command);
    return { uploaded: true };
  }
}
