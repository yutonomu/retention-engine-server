import { z } from 'zod';
import type { AvatarGender, AvatarPersonality, AvatarUrls, AvatarGenerationStatus } from '../avatar.types';

// ===== Request DTOs =====

export const UpdateAvatarSettingsSchema = z.object({
  gender: z.enum(['female', 'male', 'neutral']),
  personalityPreset: z.enum(['friendly', 'professional', 'caring', 'energetic']),
});

export type UpdateAvatarSettingsDto = z.infer<typeof UpdateAvatarSettingsSchema>;

// ===== Response DTOs =====

export interface GetAvatarSettingsResponseDto {
  userId: string;
  settings: {
    id: string;
    gender: AvatarGender;
    personalityPreset: AvatarPersonality;
    isGenerated: boolean;
    generationStatus: AvatarGenerationStatus;
    generationProgress: number;
  } | null;
  avatarUrls: AvatarUrls | null;
}

export interface GenerateAvatarResponseDto {
  status: 'generating';
  message: string;
  estimatedTime: number;
}

export interface GetAvatarStatusResponseDto {
  status: AvatarGenerationStatus | 'not_configured';
  progress: number;
  total: number;
  currentEmotion: string | null;
  isGenerated: boolean;
}
