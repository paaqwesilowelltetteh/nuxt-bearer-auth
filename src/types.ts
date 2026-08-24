export type SameSite = true | false | "lax" | "strict" | "none";

export interface BearerAuthEndpointOptions {
  login: string;
  socialLogin: string;
  logout: string;
  me: string;
  refresh: string;
  forgotPassword: string;
  resetPassword: string;
  verifyOtp: string;
  resendOtp: string;
  register: string;
}

export interface BearerAuthResponsePaths {
  token: string[];
  refreshToken: string[];
  user: string[];
  userId: string[];
  message: string[];
  success: string[];
  code: string[];
  nextAction: string[];
}

export interface BearerAuthRedirectOptions {
  login: string;
  authenticated: string;
  logout: string;
  unauthorized: string;
}

export interface BearerAuthRouteOptions {
  localApiPrefix: string;
  public: string[];
  authPages: string[];
  protectedApiPrefixes: string[];
  publicApiPrefixes: string[];
  middleware: boolean;
}

export interface BearerAuthCookieOptions {
  name: string;
  devName: string;
  maxAge: number;
  sameSite: SameSite;
  secure?: boolean;
  domain?: string;
  path: string;
}

export interface BearerAuthCsrfOptions {
  enabled: boolean;
  https: boolean;
  cookieKey: string;
  devCookieKey: string;
  headerName: string;
  methods: string[];
  methodsToProtect: string[];
  cookie: {
    path: string;
    httpOnly: boolean;
    sameSite: SameSite;
    secure?: boolean;
  };
}

// Authorization types
export type Ability = string;

export type AuthorizationSource = "session" | "endpoint";

export interface AuthorizationResponsePaths {
  roles?: string[];
  permissions?: string[];
  abilities?: string[];
}

export interface BearerAuthAuthorizationConfig {
  enabled: boolean;
  source: AuthorizationSource;
  endpoint?: string;
  responsePaths: AuthorizationResponsePaths;
  rolePrefix: string;
}

export interface BearerAuthModuleOptions {
  apiBaseUrl?: string;
  redisUrl?: string;
  sessionSecret?: string;
  appEnv?: string;
  installCsurf?: boolean;
  endpoints?: Partial<BearerAuthEndpointOptions>;
  responsePaths?: Partial<BearerAuthResponsePaths>;
  redirects?: Partial<BearerAuthRedirectOptions>;
  routes?: Partial<BearerAuthRouteOptions>;
  sessionCookie?: Partial<BearerAuthCookieOptions>;
  csrf?: Partial<BearerAuthCsrfOptions>;
  authorization?: Partial<BearerAuthAuthorizationConfig>;
  verificationRequiredActions?: string[];
  twoFactorRequiredActions?: string[];
}
