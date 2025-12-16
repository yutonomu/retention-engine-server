import { z } from 'zod';

export const llmGenerateRequestSchema = z.object({
  question: z.string().trim().min(1, 'question must not be empty.'),
  conversationId: z.string().uuid('conversationId must be a valid UUID'),
  requireWebSearch: z.boolean().default(false), // Web検索で補強するか
});

export type LlmGenerateRequestDto = z.infer<typeof llmGenerateRequestSchema>;
