import { Body, Controller, Logger, Post, UsePipes } from '@nestjs/common';
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
export class LlmController {
  // TODO: 認証ガード(@UseGuards(JwtAuthGuard))が未実装です。
  // 不正利用を防ぐため、認証を追加してください。
  private readonly logger = new Logger(LlmController.name);

  constructor(private readonly llmService: LlmService) {}

  @UsePipes(new ZodValidationPipe(llmGenerateRequestSchema))
  @Post('generate')
  async generate(@Body() payload: LlmGenerateRequestDto) {
    this.logger.log(
      `Received LLM generate request: ` +
        `question="${payload.question.substring(0, 50)}..." ` +
        `fileSearch=${payload.searchSettings?.enableFileSearch ?? true} ` +
        `webSearch=${payload.searchSettings?.allowWebSearch ?? false} ` +
        `executeWeb=${payload.searchSettings?.executeWebSearch ?? false}`,
    );

    const command: LlmGenerateCommand = {
      prompt: payload.question,
      conversationId: payload.conversationId as UUID,
      searchSettings: payload.searchSettings,
    };

    const result = await this.llmService.generate(command);

    return {
      type: result.type,
      answer: result.answer,
      needsWebSearch: result.needsWebSearch,
      webSearchReason: result.webSearchReason,
      confirmationLabels: result.confirmationLabels,
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
