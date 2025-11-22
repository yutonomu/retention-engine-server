export type UserRole = 'NEW_HIRE' | 'MENTOR';

export interface User {
  user_id: string;
  role: UserRole;
  display_name: string;
  email: string;
  created_at: Date;
  disabled_at?: Date | null;
}
