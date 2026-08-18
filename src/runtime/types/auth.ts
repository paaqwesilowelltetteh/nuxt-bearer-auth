export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

export interface BearerAuthUser {
  id?: string | number;
  uuid?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

export interface BearerAuthSession<User extends BearerAuthUser = BearerAuthUser> {
  userId: string;
  token: string;
  refreshToken?: string | null;
  profile: User | null;
  createdAt: string;
  expiresAt: number;
  lastActivity: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface PublicSession {
  id: string;
  createdAt: string;
  lastActivity: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  user?: BearerAuthUser | null;
  code?: string | number;
  nextAction?: string;
}

export interface LoginCredentials {
  identifier?: string;
  email?: string;
  username?: string;
  phone?: string;
  mobile?: string;
  password?: string;
  [key: string]: unknown;
}

export interface SocialLoginCredentials {
  jwt?: string;
  token?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface FetchUserOptions {
  refresh?: boolean;
}
