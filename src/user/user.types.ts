export type UserRole = 'NEW_HIRE' | 'MENTOR';

export interface User {
  userId: string;
  role: UserRole;
  displayName: string;
  email: string;
  createdAt: Date;
}
