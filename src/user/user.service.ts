import { Inject, Injectable } from '@nestjs/common';
import { User } from './user.types';
import type { UserProps } from './user.types';
import type { MbtiType } from './mbti.types';
import type { UserPort } from './user.port';
import type { SupabaseAdminClient } from '../supabase/adminClient';
import { PersonalityPresetService } from '../personality-preset/personalityPreset.service';
import { PersonalityPreset, type PersonalityPresetId, toPersonalityPresetId } from '../personality-preset/personalityPreset.types';

@Injectable()
export class UserService implements UserPort {
  // TODO: UserServiceがUserPortを実装しているのは暫定的な構成です。
  // 将来的には、UserService内でUserPort（抽象）を使用し、
  // UserPortの実装（データアクセス層）は別のクラス（例: UserRepository）に分離する必要があります。
  constructor(
    @Inject('SUPABASE_ADMIN_CLIENT')
    private readonly supabase: SupabaseAdminClient,
    private readonly personalityPresetService: PersonalityPresetService,
  ) { }

  async getUsers(): Promise<User[]> {
    const { data, error } = await this.supabase.from('user').select();
    if (error || !data) {
      throw error ?? new Error('Failed to fetch users.');
    }
    return data.map((row) => User.create(this.mapDbRowToUserProps(row)));
  }

  async findUserById(userId: string): Promise<User | undefined> {
    const { data, error } = await this.supabase
      .from('user')
      .select()
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data ? User.create(this.mapDbRowToUserProps(data)) : undefined;
  }

  async findUserNameById(userId: string): Promise<string | undefined> {
    const user = await this.findUserById(userId);
    return user?.display_name;
  }

  async upsertUser(user: User): Promise<void> {
    const payload = {
      user_id: user.user_id,
      role: user.role,
      display_name: user.display_name || user.email || user.user_id,
      email: user.email,
      created_at: (user.created_at ?? new Date()).toISOString(),
      disabled_at: user.disabled_at ? user.disabled_at.toISOString() : null,
      mbti: user.mbti ?? null,
      personality_preset_id: user.personalityPresetId ?? null,
    };
    const { error } = await this.supabase
      .from('user')
      .upsert(payload, { onConflict: 'user_id' });
    if (error) {
      throw error;
    }
  }

  async updateUserMbti(userId: string, mbti: MbtiType): Promise<void> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const updatedUser = User.create({
      ...user,
      mbti,
    });
    await this.upsertUser(updatedUser);
  }

  async getUserMbti(userId: string): Promise<MbtiType | null> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user.mbti;
  }

  async getUserPersonalityPreset(userId: string): Promise<PersonalityPresetId | null> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user.personalityPresetId;
  }

  async updateUserPersonalityPreset(
    userId: string,
    presetId: PersonalityPresetId | null,
  ): Promise<void> {
    // presetIdが存在する場合、バリデーション
    if (presetId !== null) {
      const allPresets = this.personalityPresetService.getAll();
      const validIds = allPresets.map((p) => p.id);
      PersonalityPreset.validateId(presetId, validIds);
    }

    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = User.create({
      ...user,
      personalityPresetId: presetId,
    });
    await this.upsertUser(updatedUser);
  }

  /**
   * データベースの行データ（スネークケース）をUserProps（キャメルケース）に変換
   */
  private mapDbRowToUserProps(row: any): UserProps {
    return {
      user_id: row.user_id,
      role: row.role,
      display_name: row.display_name,
      email: row.email,
      created_at: row.created_at,
      disabled_at: row.disabled_at,
      mbti: row.mbti,
      // DBのスネークケースをキャメルケースに変換し、PersonalityPresetId型に変換
      personalityPresetId: row.personality_preset_id ? toPersonalityPresetId(row.personality_preset_id) : null,
    };
  }
}
