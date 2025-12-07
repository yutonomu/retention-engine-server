import { Injectable } from '@nestjs/common';
import { createAdminSupabaseClient, type SupabaseAdminClient } from '../supabase/adminClient';
import type {
  AvatarSettings,
  AvatarGender,
  AvatarPersonality,
  AvatarEmotion,
  AvatarUrls,
  AvatarGenerationStatus,
} from './avatar.types';
import { AVATAR_EMOTIONS } from './avatar.types';

interface AvatarSettingsRow {
  id: string;
  user_id: string;
  gender: AvatarGender;
  personality_preset: AvatarPersonality;
  is_generated: boolean;
  generation_status: AvatarGenerationStatus;
  generation_progress: number;
  generation_seed: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class AvatarService {
  private supabase: SupabaseAdminClient;

  constructor() {
    this.supabase = createAdminSupabaseClient();
  }

  private mapRowToSettings(row: AvatarSettingsRow): AvatarSettings {
    return {
      id: row.id,
      userId: row.user_id,
      gender: row.gender,
      personalityPreset: row.personality_preset,
      isGenerated: row.is_generated,
      generationStatus: row.generation_status,
      generationProgress: row.generation_progress,
      generationSeed: row.generation_seed ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private buildAvatarUrls(userId: string): AvatarUrls {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const baseUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${userId}`;

    return {
      neutral: `${baseUrl}/neutral.webp`,
      happy: `${baseUrl}/happy.webp`,
      thinking: `${baseUrl}/thinking.webp`,
      surprised: `${baseUrl}/surprised.webp`,
      concerned: `${baseUrl}/concerned.webp`,
      proud: `${baseUrl}/proud.webp`,
    };
  }

  async getSettings(userId: string): Promise<{
    settings: AvatarSettings | null;
    avatarUrls: AvatarUrls | null;
  }> {
    const { data, error } = await this.supabase
      .from('user_avatar_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch avatar settings: ${error.message}`);
    }

    if (!data) {
      return { settings: null, avatarUrls: null };
    }

    const settings = this.mapRowToSettings(data as unknown as AvatarSettingsRow);
    const avatarUrls = settings.isGenerated ? this.buildAvatarUrls(userId) : null;

    return { settings, avatarUrls };
  }

  async upsertSettings(
    userId: string,
    gender: AvatarGender,
    personalityPreset: AvatarPersonality,
  ): Promise<AvatarSettings> {
    const { data, error } = await this.supabase
      .from('user_avatar_settings')
      .upsert(
        {
          user_id: userId,
          gender,
          personality_preset: personalityPreset,
          is_generated: false,
          generation_status: 'pending',
          generation_progress: 0,
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save avatar settings: ${error.message}`);
    }

    return this.mapRowToSettings(data as unknown as AvatarSettingsRow);
  }

  async getStatus(userId: string): Promise<{
    status: AvatarGenerationStatus | 'not_configured';
    progress: number;
    total: number;
    currentEmotion: AvatarEmotion | null;
    isGenerated: boolean;
  }> {
    const { data, error } = await this.supabase
      .from('user_avatar_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch avatar status: ${error.message}`);
    }

    if (!data) {
      return {
        status: 'not_configured',
        progress: 0,
        total: AVATAR_EMOTIONS.length,
        currentEmotion: null,
        isGenerated: false,
      };
    }

    const settings = this.mapRowToSettings(data as unknown as AvatarSettingsRow);

    const currentEmotion =
      settings.generationStatus === 'generating' &&
      settings.generationProgress < AVATAR_EMOTIONS.length
        ? AVATAR_EMOTIONS[settings.generationProgress]
        : null;

    return {
      status: settings.generationStatus,
      progress: settings.generationProgress,
      total: AVATAR_EMOTIONS.length,
      currentEmotion,
      isGenerated: settings.isGenerated,
    };
  }

  async startGeneration(userId: string): Promise<void> {
    // 현재 설정 확인
    const { data: settingsData, error: settingsError } = await this.supabase
      .from('user_avatar_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settingsData) {
      throw new Error('Avatar settings not found. Please configure settings first.');
    }

    const settings = settingsData as unknown as AvatarSettingsRow;

    // 이미 생성 중인 경우
    if (settings.generation_status === 'generating') {
      throw new Error('Avatar generation is already in progress');
    }

    // 생성 상태로 업데이트
    await this.updateGenerationStatus(userId, 'generating', 0);

    // 비동기로 이미지 생성 시작
    this.generateAvatarsAsync(userId, settings.gender, settings.personality_preset).catch(
      (error) => {
        console.error('Avatar generation failed:', error);
        this.updateGenerationStatus(userId, 'failed', 0);
      },
    );
  }

  private async updateGenerationStatus(
    userId: string,
    status: AvatarGenerationStatus,
    progress: number,
  ): Promise<void> {
    await this.supabase
      .from('user_avatar_settings')
      .update({
        generation_status: status,
        generation_progress: progress,
        is_generated: status === 'completed',
      })
      .eq('user_id', userId);
  }

  private async generateAvatarsAsync(
    userId: string,
    gender: AvatarGender,
    personality: AvatarPersonality,
  ): Promise<void> {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    for (let i = 0; i < AVATAR_EMOTIONS.length; i++) {
      const emotion = AVATAR_EMOTIONS[i];

      // 진행 상태 업데이트
      await this.updateGenerationStatus(userId, 'generating', i);

      try {
        // 이미지 생성
        const imageBuffer = await this.generateAvatarImage(gender, personality, emotion, apiKey);

        // Supabase Storage에 업로드
        const filePath = `${userId}/${emotion}.webp`;
        const { error: uploadError } = await this.supabase.storage
          .from('avatars')
          .upload(filePath, imageBuffer, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // Rate limiting
        if (i < AVATAR_EMOTIONS.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      } catch (error) {
        console.error(`Failed to generate ${emotion} avatar:`, error);
        await this.updateGenerationStatus(userId, 'failed', i);
        throw error;
      }
    }

    // 완료 상태로 업데이트
    await this.updateGenerationStatus(userId, 'completed', AVATAR_EMOTIONS.length);
  }

  private async generateAvatarImage(
    gender: AvatarGender,
    personality: AvatarPersonality,
    emotion: AvatarEmotion,
    apiKey: string,
  ): Promise<Buffer> {
    const prompt = this.buildAvatarPrompt(gender, personality, emotion);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Gemini API error response:', errorBody);
      throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    const candidates = data.candidates;

    if (!candidates || candidates.length === 0) {
      throw new Error('No image generated');
    }

    const parts = candidates[0].content?.parts;
    const imagePart = parts?.find(
      (part: { inlineData?: { mimeType: string; data: string } }) =>
        part.inlineData?.mimeType?.startsWith('image/'),
    );

    if (!imagePart?.inlineData?.data) {
      throw new Error('No image data in response');
    }

    // Base64 → Buffer → WebP 변환 (Sharp 사용)
    const rawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');

    // Sharp로 WebP 변환 (256x256, quality 88)
    const sharp = require('sharp');
    const processedBuffer = await sharp(rawBuffer)
      .resize(256, 256, { fit: 'cover', position: 'centre' })
      .webp({ quality: 88 })
      .toBuffer();

    return processedBuffer;
  }

  private buildAvatarPrompt(
    gender: AvatarGender,
    personality: AvatarPersonality,
    emotion: AvatarEmotion,
  ): string {
    const personalityDescriptions: Record<AvatarPersonality, { description: string; traits: string }> = {
      friendly: {
        description: 'warm and approachable',
        traits: 'gentle smile lines, soft eyes, relaxed posture, welcoming expression',
      },
      professional: {
        description: 'confident and competent',
        traits: 'sharp features, poised expression, elegant, sophisticated demeanor',
      },
      caring: {
        description: 'nurturing and supportive',
        traits: 'kind eyes, warm complexion, gentle demeanor, comforting presence',
      },
      energetic: {
        description: 'dynamic and enthusiastic',
        traits: 'bright eyes, vibrant expression, lively, animated features',
      },
    };

    const emotionExpressions: Record<AvatarEmotion, string> = {
      neutral: 'calm and attentive expression, slight professional smile, ready to listen',
      happy: 'genuine warm smile, eyes slightly crinkled with joy, radiating positivity',
      thinking: 'thoughtful expression, slight head tilt, focused gaze, contemplative',
      surprised: 'pleasantly surprised, raised eyebrows, bright eyes, delighted discovery',
      concerned: 'caring concerned look, slightly furrowed brow, empathetic expression',
      proud: 'beaming with pride, confident smile, approving expression, celebrating success',
    };

    const genderDescriptions: Record<AvatarGender, string> = {
      female: 'female',
      male: 'male',
      neutral: 'androgynous',
    };

    const personalityConfig = personalityDescriptions[personality];
    const emotionExpr = emotionExpressions[emotion];
    const genderDesc = genderDescriptions[gender];

    return `Professional photograph style portrait of a ${genderDesc} ${personalityConfig.description} office mentor in their early 30s.

Physical appearance: ${personalityConfig.traits}

Expression: ${emotionExpr}

Setting: Wearing smart business casual attire (blazer or cardigan over neat shirt), soft studio lighting with subtle rim light, clean gradient background (light gray to white), upper body shot centered in frame, facing camera with slight three-quarter angle.

Technical requirements: High quality, detailed facial features, natural skin texture, professional headshot composition, 1:1 square aspect ratio, photorealistic style.

Important: Maintain consistent character identity - same face structure, hair style, and clothing across different expressions.`;
  }
}
