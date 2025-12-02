import { z } from 'zod';
import { VALID_MBTI_TYPES, type MbtiType } from '../mbti.types';

export const updateMbtiSchema = z.object({
    mbti: z.enum(VALID_MBTI_TYPES as [MbtiType, ...MbtiType[]]),
});

export type UpdateMbtiDto = z.infer<typeof updateMbtiSchema>;
