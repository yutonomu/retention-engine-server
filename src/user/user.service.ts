import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { User } from './user.types';
import type { UserPort } from './user.port';

@Injectable()
export class UserService implements UserPort {
  constructor(
    @Inject('SUPABASE_ADMIN_CLIENT')
    private readonly supabase: SupabaseClient,
  ) {}

  async getUsers(): Promise<User[]> {
    const { data, error } = await this.supabase.from('user').select();
    if (error || !data) {
      throw error ?? new Error('Failed to fetch users.');
    }
    return data as unknown as User[];
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
    return (data as unknown as User) ?? undefined;
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
      created_at: user.created_at ?? new Date().toISOString(),
      disabled_at: user.disabled_at ?? null,
    };
    const { error } = await this.supabase.from('user').upsert(payload, { onConflict: 'user_id' });
    if (error) {
      throw error;
    }
  }
}
