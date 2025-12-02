export type UserRole = 'NEW_HIRE' | 'MENTOR';
import { MbtiType, VALID_MBTI_TYPES } from './mbti.types';
export type { MbtiType };
export { VALID_MBTI_TYPES };



export interface UserProps {
  user_id: string;
  role: UserRole;
  display_name: string;
  email: string;
  created_at: Date | string;
  disabled_at?: Date | string | null;
  mbti?: MbtiType | null;
}

export class User {
  readonly user_id: string;
  readonly role: UserRole;
  readonly display_name: string;
  readonly email: string;
  readonly created_at: Date;
  readonly disabled_at: Date | null;
  readonly mbti: MbtiType | null;

  constructor(raw: UserProps) {
    const userId = raw.user_id?.trim();
    if (!userId) {
      throw new Error('user_id is required');
    }

    if (!['NEW_HIRE', 'MENTOR'].includes(raw.role)) {
      throw new Error('role must be either NEW_HIRE or MENTOR');
    }

    const displayName = raw.display_name?.trim();
    if (!displayName) {
      throw new Error('display_name is required');
    }

    if (typeof raw.email !== 'string') {
      throw new Error('email is required');
    }

    const createdAt = User.parseDate(raw.created_at, 'created_at');
    const disabledAt = User.parseNullableDate(raw.disabled_at, 'disabled_at');
    const mbti = User.validateMbti(raw.mbti);

    this.user_id = userId;
    this.role = raw.role;
    this.display_name = displayName;
    this.email = raw.email;
    this.created_at = createdAt;
    this.disabled_at = disabledAt;
    this.mbti = mbti;
  }

  static create(raw: UserProps): User {
    return new User(raw);
  }

  private static validateMbti(mbti?: MbtiType | null): MbtiType | null {
    if (mbti == null) {
      return null;
    }
    const normalized = mbti.toUpperCase() as MbtiType;
    if (VALID_MBTI_TYPES.includes(normalized)) {
      return normalized;
    }
    throw new Error('Invalid MBTI type. Must be one of 16 valid types.');
  }

  private static parseDate(value: Date | string, field: string): Date {
    const parsed = value instanceof Date ? value : new Date(value ?? undefined);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${field} must be a valid date`);
    }
    return parsed;
  }

  private static parseNullableDate(
    value: Date | string | null | undefined,
    field: string,
  ): Date | null {
    if (value == null) {
      return null;
    }
    return this.parseDate(value, field);
  }
}
