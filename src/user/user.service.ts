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
}
