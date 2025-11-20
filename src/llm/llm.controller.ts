import { Body, Controller, Logger, Post, UsePipes } from '@nestjs/common';
import { llmGenerateRequestSchema } from './dto/llmGenerateRequest.dto';
import type { LlmGenerateRequestDto } from './dto/llmGenerateRequest.dto';
import { ZodValidationPipe } from '../common/pipes/zodValidation.pipe';
import { LlmService, type LlmGenerateCommand } from './llm.service';

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
      conversationId: payload.conversationId,
    };

    const result = await this.llmService.generate(command);

    return {
      answer: result.answer,
    };
  }
}
