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

const mockCallAuthApi = vi.fn();
vi.mock("../src/runtime/server/utils/external-api", () => ({
  callAuthApi: (...args: any[]) => mockCallAuthApi(...args),
  getAuthEndpoint: (name: keyof typeof mockConfig.endpoints) => mockConfig.endpoints[name],
  requireApiBaseUrl: () => mockConfig.apiBaseUrl,
}));

import {
  ensureBearerAuthRedisConnection,
  getBearerAuthRedisClient,
} from "../src/runtime/server/utils/sessions";

import otpHandler from "../src/runtime/server/api/auth/otp-verification.post";
import registerHandler from "../src/runtime/server/api/auth/register.post";
import resendOtpHandler from "../src/runtime/server/api/auth/resend-otp/[identifier].post";
import forgotPasswordHandler from "../src/runtime/server/api/auth/forgot-password.post";
import resetPasswordHandler from "../src/runtime/server/api/auth/reset-password.post";

function createMockEvent(options: {
  method?: string;
  body?: any;
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

describe("Additional Auth Handlers (OTP, Register, Password Reset)", () => {
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

  describe("otp-verification.post", () => {
    it("verifies OTP and creates session when token and userId are returned", async () => {
      mockCallAuthApi.mockResolvedValueOnce({
        data: {
          token: "verified_otp_token",
          user: { id: "u200", email: "user@example.com" },
        },
      });

      const { event, setCookies } = createMockEvent({
        body: { identifier: "user@example.com", otp: "123456" },
      });

      const result = await otpHandler(event);
      expect(result.success).toBe(true);
      expect(result.user).toEqual({ id: "u200", email: "user@example.com" });
      expect(setCookies.some((c) => c.name === "nuxt_bearer_auth_session_dev")).toBe(true);
    });

    it("validates missing OTP or identifier", async () => {
      const { event } = createMockEvent({ body: { email: "user@example.com" } });
      await expect(otpHandler(event)).rejects.toThrow();
    });
  });

  describe("register.post", () => {
    it("registers user and automatically logs in when backend returns token", async () => {
      mockCallAuthApi.mockResolvedValueOnce({
        data: {
          token: "reg_bearer_token",
          user: { id: "u300", email: "reg@example.com" },
        },
      });

      const { event, setCookies } = createMockEvent({
        body: { name: "New User", email: "reg@example.com", password: "password123" },
      });

      const result = await registerHandler(event);
      expect(result.success).toBe(true);
      expect(result.user).toEqual({ id: "u300", email: "reg@example.com" });
      expect(setCookies.some((c) => c.name === "nuxt_bearer_auth_session_dev")).toBe(true);
    });

    it("registers user without session when backend only returns user (e.g. requires email verification)", async () => {
      mockCallAuthApi.mockResolvedValueOnce({
        success: true,
        message: "Registration successful. Please check your email.",
        data: {
          user: { id: "u301", email: "verify@example.com" },
        },
      });

      const { event, setCookies } = createMockEvent({
        body: { name: "Pending User", email: "verify@example.com", password: "password123" },
      });

      const result = await registerHandler(event);
      expect(result.success).toBe(true);
      expect(setCookies.length).toBe(0);
    });
  });

  describe("resend-otp.post", () => {
    it("calls backend with interpolated identifier path", async () => {
      mockCallAuthApi.mockResolvedValueOnce({ success: true, message: "OTP resent" });

      const { event } = createMockEvent({
        params: { identifier: "test@example.com" },
        body: {},
      });

      const result = await resendOtpHandler(event);
      expect(result).toEqual({ success: true, message: "OTP resent" });
      expect(mockCallAuthApi).toHaveBeenCalledWith(
        "auth/resend-otp/test%40example.com",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("forgot & reset password", () => {
    it("proxies forgot-password request", async () => {
      mockCallAuthApi.mockResolvedValueOnce({ success: true, message: "Password reset link sent" });

      const { event } = createMockEvent({
        body: { email: "forgot@example.com" },
      });

      const result = await forgotPasswordHandler(event);
      expect(result).toEqual({ success: true, message: "Password reset link sent" });
    });

    it("proxies reset-password request", async () => {
      mockCallAuthApi.mockResolvedValueOnce({ success: true, message: "Password has been reset" });

      const { event } = createMockEvent({
        body: { token: "reset-token", password: "newpassword" },
      });

      const result = await resetPasswordHandler(event);
      expect(result).toEqual({ success: true, message: "Password has been reset" });
    });
  });
});
