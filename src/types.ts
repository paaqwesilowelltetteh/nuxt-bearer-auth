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
  strictPrefixMatching?: boolean;
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

export type AuthorizationMatchMode = "all" | "any";

export interface AuthorizationRouteRequirement {
  abilities: string[];
  mode?: AuthorizationMatchMode;
}

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

/**
 * Shape of the private (server-side) `runtimeConfig.bearerAuth` namespace
 * populated by the module. Never place functions or secrets beyond what the
 * server requires here; runtime configuration must stay serializable.
 */
export interface BearerAuthPrivateRuntimeConfig {
  apiBaseUrl: string;
  redisUrl: string;
  sessionSecret: string;
  appEnv: string;
  endpoints: BearerAuthEndpointOptions;
  responsePaths: BearerAuthResponsePaths;
  sessionCookie: BearerAuthCookieOptions;
  authorization: BearerAuthAuthorizationConfig;
  verificationRequiredActions: string[];
  twoFactorRequiredActions: string[];
}

/**
 * Shape of the public `runtimeConfig.public.bearerAuth` namespace.
 * Only serializable, browser-safe values are allowed here.
 */
export interface BearerAuthSessionLivenessConfig {
  /** Enables automatic client-side validation triggers. Manual validation remains available. */
  enabled: boolean;
  /** Periodic validation interval in milliseconds. Set to 0 to disable the timer. */
  intervalMs: number;
  /** Minimum time between validation requests, regardless of trigger. */
  minIntervalMs: number;
  validateOnMount: boolean;
  validateOnFocus: boolean;
  validateOnVisibilityChange: boolean;
  validateOnNavigation: boolean;
  /** Skip periodic and event-triggered probes while the document is hidden. */
  onlyWhenVisible: boolean;
  /** Synchronise logout and confirmed expiry between tabs. */
  crossTab: boolean;
  /** BroadcastChannel name and storage-fallback namespace. */
  channelName: string;
}

export type BearerAuthSessionValidity =
  | "unknown"
  | "valid"
  | "invalid"
  | "unavailable";

export type BearerAuthSessionValidationResult =
  | "valid"
  | "invalid"
  | "unavailable"
  | "skipped";

export interface UseBearerAuthSessionOptions
  extends Partial<
    Omit<BearerAuthSessionLivenessConfig, "crossTab" | "channelName">
  > {
  /** Called when this tab or another tab confirms that the session is invalid. */
  onSessionInvalidated?: () => void;
  /** Called when a liveness probe cannot establish session validity. */
  onValidationError?: (error: unknown) => void;
}

export interface BearerAuthPublicRuntimeConfig {
  redirects: Required<BearerAuthRedirectOptions>;
  routes: Required<BearerAuthRouteOptions>;
  authorizationEnabled: boolean;
  sessionLiveness: BearerAuthSessionLivenessConfig;
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
  sessionLiveness?: Partial<BearerAuthSessionLivenessConfig>;
  verificationRequiredActions?: string[];
  twoFactorRequiredActions?: string[];
}
