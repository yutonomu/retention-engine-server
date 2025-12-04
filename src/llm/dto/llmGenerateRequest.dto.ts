import { z } from 'zod';

/**
 * 検索設定スキーマ
 */
export const searchSettingsSchema = z.object({
  enableFileSearch: z.boolean().default(true), // FileSearch有効化
  allowWebSearch: z.boolean().default(false), // Web検索許可
  executeWebSearch: z.boolean().optional(), // Web検索実行（ユーザー承認後）
});

export const llmGenerateRequestSchema = z.object({
  question: z.string().trim().min(1, 'question must not be empty.'),
  conversationId: z.string().min(1, 'conversationId must not be empty.'),
  searchSettings: searchSettingsSchema.optional(),
});

export type SearchSettings = z.infer<typeof searchSettingsSchema>;
export type LlmGenerateRequestDto = z.infer<typeof llmGenerateRequestSchema>;
