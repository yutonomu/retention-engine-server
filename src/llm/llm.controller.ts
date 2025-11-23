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
  private readonly logger = new Logger(LlmController.name);

  constructor(private readonly llmService: LlmService) {}

  @UsePipes(new ZodValidationPipe(llmGenerateRequestSchema))
  @Post('generate')
  async generate(@Body() payload: LlmGenerateRequestDto) {
    this.logger.log(
      `Received LLM generate request payload=${JSON.stringify(payload)}`,
    );

    const command: LlmGenerateCommand = {
      prompt: payload.question,
      conversationId: payload.conversationId as UUID,
    };

    const result = await this.llmService.generate(command);

    return {
      answer: result.answer,
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
