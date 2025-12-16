import { Body, Controller, Logger, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { llmGenerateRequestSchema } from './dto/llmGenerateRequest.dto';
import type { LlmGenerateRequestDto } from './dto/llmGenerateRequest.dto';
import { ZodValidationPipe } from '../common/pipes/zodValidation.pipe';
import {
  LlmService,
  type LlmGenerateCommand,
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
    
    this.logger.debug(
      `[${requestId}] Request stack trace: ${stackTrace}`,
    );

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
