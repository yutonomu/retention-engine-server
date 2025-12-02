import { z } from 'zod';

export const PresetSummarySchema = z.object({
    id: z.string(),
    displayName: z.string(),
});

export type PresetSummaryDto = z.infer<typeof PresetSummarySchema>;

export const GetPresetsResponseSchema = z.object({
    presets: z.array(PresetSummarySchema),
});

export type GetPresetsResponseDto = z.infer<typeof GetPresetsResponseSchema>;
