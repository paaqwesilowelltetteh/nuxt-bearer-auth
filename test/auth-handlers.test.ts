import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import { EventEmitter } from "node:events";

let mockConfig = {
  apiBaseUrl: "https://api.example.com",
  redisUrl: "redis://127.0.0.1:6379",
  sessionSecret: "",
  appEnv: "development",
  endpoints: {
    login: "auth/login",
    socialLogin: "auth/social-login",
    logout: "auth/logout",
    me: "auth/account/me",
    refresh: "auth/refresh",
    forgotPassword: "auth/forgot-password",
    resetPassword: "auth/reset-password",
    verifyOtp: "auth/verify-otp",
    resendOtp: "auth/resend-otp/:identifier",
    register: "auth/register",
  },
  responsePaths: {
    token: ["data.token", "token", "access_token"],
    refreshToken: ["data.refreshToken", "refreshToken"],
    user: ["data.user", "user"],
    userId: ["id", "uuid", "data.id"],
    message: ["message", "data.message"],
    success: ["success", "status"],
    code: ["code", "data.code"],
    nextAction: ["next_action", "data.next_action", "nextAction"],
  },
  sessionCookie: {
    name: "nuxt_bearer_auth_session",
    devName: "nuxt_bearer_auth_session_dev",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax" as const,
    secure: undefined,
    domain: undefined,
    path: "/",
  },
  verificationRequiredActions: ["verify_account"],
  twoFactorRequiredActions: ["2fa_required"],
};

vi.mock("../src/runtime/server/utils/config", () => ({
  getBearerAuthConfig: () => mockConfig,
  requireApiBaseUrl: () => mockConfig.apiBaseUrl,
  getSessionCookieName: () =>
    mockConfig.appEnv === "development" || mockConfig.appEnv === "local"
      ? mockConfig.sessionCookie.devName
      : mockConfig.sessionCookie.name,
  isProductionRuntime: () => mockConfig.appEnv === "production",
  getAuthEndpoint: (name: keyof typeof mockConfig.endpoints) => mockConfig.endpoints[name],
}));

// Mock callAuthApi from external-api
const mockCallAuthApi = vi.fn();
vi.mock("../src/runtime/server/utils/external-api", () => ({
  callAuthApi: (...args: any[]) => mockCallAuthApi(...args),
  getAuthEndpoint: (name: keyof typeof mockConfig.endpoints) => mockConfig.endpoints[name],
  requireApiBaseUrl: () => mockConfig.apiBaseUrl,
}));

import {
  createBearerAuthSession,
  ensureBearerAuthRedisConnection,
  getBearerAuthRedisClient,
} from "../src/runtime/server/utils/sessions";

import loginHandler from "../src/runtime/server/api/auth/login.post";
import logoutHandler from "../src/runtime/server/api/auth/logout.post";
import refreshHandler from "../src/runtime/server/api/auth/refresh.post";
import meHandler from "../src/runtime/server/api/auth/me.get";
import otpHandler from "../src/runtime/server/api/auth/otp-verification.post";
import socialHandler from "../src/runtime/server/api/auth/social-login.post";
import registerHandler from "../src/runtime/server/api/auth/register.post";
import resendOtpHandler from "../src/runtime/server/api/auth/resend-otp/[identifier].post";

function createMockEvent(options: {
  method?: string;
  body?: any;
  query?: Record<string, string>;
  params?: Record<string, string>;
  cookies?: Record<string, string>;
  auth?: any;
} = {}) {
  const setCookies: Array<{ name: string; value: string; options: any }> = [];
  const bodyBuffer = options.body !== undefined ? Buffer.from(JSON.stringify(options.body)) : null;

  const req = new EventEmitter() as any;
  req.method = options.method || "POST";
  req.headers = {
    cookie: Object.entries(options.cookies || {})
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
    "user-agent": "Vitest/1.0",
    "content-type": "application/json",
    "content-length": bodyBuffer ? bodyBuffer.length.toString() : "0",
  };
  req.socket = { remoteAddress: "127.0.0.1" };

  // When H3 attaches 'data' and 'end' listeners in readRawBody
  const origOn = req.on.bind(req);
  req.on = function (event: string, listener: any) {
    origOn(event, listener);
    if (event === "data" && bodyBuffer) {
      process.nextTick(() => {
        req.emit("data", bodyBuffer);
        req.emit("end");
      });
    } else if (event === "end" && !bodyBuffer) {
      process.nextTick(() => req.emit("end"));
    }
    return req;
  };

  const event: Partial<H3Event> = {
    method: options.method || "POST",
    node: {
      req,
      res: {
        setHeader: (name: string, value: any) => {
          if (name.toLowerCase() === "set-cookie") {
            const arr = Array.isArray(value) ? value : [value];
            arr.forEach((cookieStr: string) => {
              const [nv] = cookieStr.split(";");
              const [k, v] = nv.split("=");
              setCookies.push({ name: k.trim(), value: v ? v.trim() : "", options: cookieStr });
            });
          }
        },
        getHeader: () => undefined,
      } as any,
    },
    context: {
      auth: options.auth,
      params: options.params,
    },
  };

  return { event: event as H3Event, setCookies };
}

describe("Nitro Authentication API Handlers", () => {
  beforeEach(async () => {
    mockCallAuthApi.mockReset();
    const redis = await ensureBearerAuthRedisConnection();
    const keys = await redis.keys("session:*");
    const userKeys = await redis.keys("user_sessions:*");
    const allKeys = [...keys, ...userKeys];
    if (allKeys.length > 0) {
      await redis.del(allKeys);
    }
  });

  afterAll(async () => {
    const client = getBearerAuthRedisClient();
    if (client.isOpen) {
      await client.quit();
    }
  });

  describe("login.post", () => {
    it("successfully logs in, creates server session in Redis and sets cookie", async () => {
      mockCallAuthApi.mockResolvedValueOnce({
        success: true,
        data: {
          token: "sanctum_bearer_token_123",
          user: { id: "u100", name: "John Doe", email: "john@example.com" },
        },
      });

      const { event, setCookies } = createMockEvent({
        method: "POST",
        body: { email: "john@example.com", password: "password123" },
      });

      const result = await loginHandler(event);

      expect(result).toEqual({
        success: true,
        user: { id: "u100", name: "John Doe", email: "john@example.com" },
        message: "Login successful",
      });

      // Token must NOT be returned in result
      expect((result as any).token).toBeUndefined();

      // Cookie should be set
      expect(setCookies.some((c) => c.name === "nuxt_bearer_auth_session_dev")).toBe(true);
    });

    it("returns nextAction when account verification is required without creating a session", async () => {
      mockCallAuthApi.mockResolvedValueOnce({
        success: true,
        next_action: "verify_account",
        code: "VERIFY_EMAIL",
        message: "Please verify your email",
        user: { id: "u101", email: "unverified@example.com" },
      });

      const { event, setCookies } = createMockEvent({
        method: "POST",
        body: { email: "unverified@example.com", password: "password123" },
      });

      const result = await loginHandler(event);

      expect(result).toEqual({
        success: true,
        code: "VERIFY_EMAIL",
        nextAction: "verify_account",
        user: { id: "u101", email: "unverified@example.com" },
        message: "Please verify your email",
      });

      // No session cookie should be set
      expect(setCookies.length).toBe(0);
    });

    it("returns 422 if credentials body is empty", async () => {
      const { event } = createMockEvent({ method: "POST", body: {} });
      await expect(loginHandler(event)).rejects.toThrow();
    });
  });

  describe("refresh.post", () => {
    it("refreshes access token and updates existing session in Redis", async () => {
      const { event: createEvent } = createMockEvent();
      const sessionId = await createBearerAuthSession(createEvent, {
        userId: "u_refresh",
        token: "old_token",
        refreshToken: "refresh_123",
        profile: { id: "u_refresh", name: "Alice" },
      });

      const { event: refreshEvent } = createMockEvent({
        method: "POST",
        cookies: { nuxt_bearer_auth_session_dev: sessionId },
        auth: {
          userId: "u_refresh",
          token: "old_token",
          refreshToken: "refresh_123",
          profile: { id: "u_refresh", name: "Alice" },
        },
      });

      mockCallAuthApi.mockResolvedValueOnce({
        success: true,
        data: {
          token: "new_refreshed_token",
          refreshToken: "new_refresh_456",
        },
      });

      const result = await refreshHandler(refreshEvent);

      expect(result).toEqual({
        success: true,
        user: { id: "u_refresh", name: "Alice" },
        message: "Session refreshed",
      });

      // Access token must NOT be in the client response
      expect((result as any).token).toBeUndefined();

      // Check in Redis
      const redis = await ensureBearerAuthRedisConnection();
      const sessionData = JSON.parse((await redis.get(`session:${sessionId}`))!);
      expect(sessionData.token).toBe("new_refreshed_token");
      expect(sessionData.refreshToken).toBe("new_refresh_456");
    });

    it("throws 401 when trying to refresh without authenticated session context", async () => {
      const { event } = createMockEvent({ method: "POST" });
      await expect(refreshHandler(event)).rejects.toThrow("Unauthenticated");
    });
  });

  describe("logout.post", () => {
    it("destroys local session and clears cookie even if remote logout endpoint errors", async () => {
      const { event: createEvent } = createMockEvent();
      const sessionId = await createBearerAuthSession(createEvent, {
        userId: "u_logout",
        token: "logout_token",
      });

      const { event: logoutEvent, setCookies } = createMockEvent({
        method: "POST",
        cookies: { nuxt_bearer_auth_session_dev: sessionId },
        auth: { userId: "u_logout", token: "logout_token" },
      });

      // Mock remote API failure
      mockCallAuthApi.mockRejectedValueOnce(new Error("Remote backend is down"));

      const result = await logoutHandler(logoutEvent);

      expect(result).toEqual({
        success: true,
        message: "Logged out successfully",
      });

      // Local session must still be deleted from Redis
      const redis = await ensureBearerAuthRedisConnection();
      expect(await redis.get(`session:${sessionId}`)).toBeNull();

      // Cookie deletion header must be present
      expect(setCookies.some((c) => c.name === "nuxt_bearer_auth_session_dev")).toBe(true);
    });
  });

  describe("me.get", () => {
    it("returns session profile from cache when refresh is not requested", async () => {
      const { event } = createMockEvent({
        method: "GET",
        auth: {
          userId: "u_me",
          token: "tok",
          profile: { id: "u_me", email: "me@example.com" },
        },
      });

      const result = await meHandler(event);
      expect(result).toEqual({
        user: { id: "u_me", email: "me@example.com" },
      });
      // Should not call external API
      expect(mockCallAuthApi).not.toHaveBeenCalled();
    });
  });

  describe("social-login.post", () => {
    it("authenticates with OAuth provider token and creates session", async () => {
      mockCallAuthApi.mockResolvedValueOnce({
        data: {
          token: "oauth_bearer_token",
          user: { id: "google_123", email: "oauth@example.com" },
        },
      });

      const { event, setCookies } = createMockEvent({
        method: "POST",
        body: { provider: "google", jwt: "mock_jwt_credential" },
      });

      const result = await socialHandler(event);

      expect(result).toEqual({
        success: true,
        user: { id: "google_123", email: "oauth@example.com" },
        message: "Login successful",
      });

      expect(setCookies.some((c) => c.name === "nuxt_bearer_auth_session_dev")).toBe(true);
    });
  });
});
