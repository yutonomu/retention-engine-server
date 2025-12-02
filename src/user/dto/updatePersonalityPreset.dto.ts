import { z } from 'zod';

export const UpdatePersonalityPresetSchema = z.object({
    presetId: z.string().nullable(),
});

export type UpdatePersonalityPresetDto = z.infer<typeof UpdatePersonalityPresetSchema>;
