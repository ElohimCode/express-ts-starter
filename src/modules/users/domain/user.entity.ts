export type UserRole = 'USER' | 'ADMIN';

export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserProfile = Omit<UserEntity, 'passwordHash'>;

export function toUserProfile(user: UserEntity): UserProfile {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...profile } = user;
  return profile;
}
