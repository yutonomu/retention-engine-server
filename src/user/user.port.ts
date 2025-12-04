import type { PersonalityPresetId } from '../personality-preset/personalityPreset.types';
import type { User, MbtiType } from './user.types';

export interface UserPort {
  getUsers(): Promise<User[]>;
  findUserById(userId: string): Promise<User | undefined>;
  findUserNameById(userId: string): Promise<string | undefined>;
  upsertUser(user: User): Promise<void>;
  updateUserMbti(userId: string, mbti: MbtiType): Promise<void>;
  getUserMbti(userId: string): Promise<MbtiType | null>;
  getUserPersonalityPreset(userId: string): Promise<PersonalityPresetId | null>;
}

export const USER_PORT = 'USER_PORT';
