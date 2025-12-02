import { z } from 'zod';

export const GetPersonalityPresetResponseSchema = z.object({
    presetId: z.string().nullable(),
});

export type GetPersonalityPresetResponseDto = z.infer<typeof GetPersonalityPresetResponseSchema>;
