import { z } from 'zod';

export const llmGenerateRequestSchema = z.object({
  question: z.string().trim().min(1, 'question must not be empty.'),
  conversationId: z.string().trim().min(1, 'conversationId must not be empty.'),
});

export type LlmGenerateRequestDto = z.infer<typeof llmGenerateRequestSchema>;
