import { z } from 'zod';
import { UUIDSchema } from '../../common/uuid';

export const llmGenerateRequestSchema = z.object({
  question: z.string().trim().min(1, 'question must not be empty.'),
  conversationId: UUIDSchema,
});

export type LlmGenerateRequestDto = z.infer<typeof llmGenerateRequestSchema>;
