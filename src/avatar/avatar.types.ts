export type AvatarGender = 'female' | 'male' | 'neutral';

export type AvatarPersonality = 'friendly' | 'professional' | 'caring' | 'energetic';

export type AvatarEmotion = 'neutral' | 'happy' | 'thinking' | 'surprised' | 'concerned' | 'proud';

export type AvatarGenerationStatus = 'pending' | 'generating' | 'completed' | 'failed';

export const AVATAR_EMOTIONS: AvatarEmotion[] = [
  'neutral',
  'happy',
  'thinking',
  'surprised',
  'concerned',
  'proud',
];

export interface AvatarSettings {
  id: string;
  userId: string;
  gender: AvatarGender;
  personalityPreset: AvatarPersonality;
  isGenerated: boolean;
  generationStatus: AvatarGenerationStatus;
  generationProgress: number;
  generationSeed?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarUrls {
  neutral: string;
  happy: string;
  thinking: string;
  surprised: string;
  concerned: string;
  proud: string;
}
