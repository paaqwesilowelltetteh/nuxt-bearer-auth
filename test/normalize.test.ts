import { describe, expect, it, vi } from "vitest";

vi.mock("../src/runtime/server/utils/config", () => ({
  getBearerAuthConfig: () => ({
    responsePaths: {
      token: ["data.token", "token", "access_token", "data.access_token"],
      refreshToken: [
        "data.refreshToken",
        "data.refresh_token",
        "refreshToken",
        "refresh_token",
      ],
      user: ["data.user", "user", "data", "$"],
      userId: ["id", "uuid", "data.id", "data.uuid"],
      message: ["message", "data.message"],
      success: ["success", "status"],
      code: ["code", "data.code"],
      nextAction: ["next_action", "data.next_action", "nextAction"],
    },
    verificationRequiredActions: ["verify_account", "verification_required"],
    twoFactorRequiredActions: ["two_factor_required", "2fa_required"],
  }),
}));

import {
  normalizeAuthResponse,
  requiresTwoFactor,
  requiresVerification,
} from "../src/runtime/server/utils/normalize";

describe("normalize utility", () => {
  it("normalizes standard Laravel Sanctum format response", () => {
    const payload = {
      success: true,
      message: "Login successful",
      data: {
        token: "1|laravel_plain_token",
        refreshToken: "refresh-token-123",
        user: {
          id: 42,
          name: "Enoch",
          email: "enoch@example.com",
        },
      },
    };

    const normalized = normalizeAuthResponse(payload);

    expect(normalized.success).toBe(true);
    expect(normalized.token).toBe("1|laravel_plain_token");
    expect(normalized.refreshToken).toBe("refresh-token-123");
    expect(normalized.user).toEqual({
      id: 42,
      name: "Enoch",
      email: "enoch@example.com",
    });
    expect(normalized.userId).toBe("42");
    expect(normalized.message).toBe("Login successful");
  });

  it("normalizes FastAPI / OAuth snake_case format response", () => {
    const payload = {
      access_token: "jwt_token_sample",
      refresh_token: "rf_sample_token",
      token_type: "bearer",
      user: {
        uuid: "usr_9921",
        email: "alex@example.com",
      },
    };

    const normalized = normalizeAuthResponse(payload);

    expect(normalized.token).toBe("jwt_token_sample");
    expect(normalized.refreshToken).toBe("rf_sample_token");
    expect(normalized.user).toEqual({
      uuid: "usr_9921",
      email: "alex@example.com",
    });
    expect(normalized.userId).toBe("usr_9921");
    expect(normalized.success).toBe(true);
  });

  it("normalizes response with top-level user where user object IS data ($ path)", () => {
    const payload = {
      token: "bearer_xyz",
      id: 101,
      name: "Direct User",
      email: "direct@example.com",
    };

    const normalized = normalizeAuthResponse(payload);
    expect(normalized.token).toBe("bearer_xyz");
    expect(normalized.userId).toBe("101");
    expect(normalized.user).toBeDefined();
  });

  it("handles verification required action payload", () => {
    const payload = {
      success: true,
      message: "Please verify your account",
      code: "ACC_NOT_VERIFIED",
      next_action: "verify_account",
      user: {
        id: 10,
        email: "user@example.com",
      },
    };

    const normalized = normalizeAuthResponse(payload);
    expect(normalized.nextAction).toBe("verify_account");
    expect(normalized.code).toBe("ACC_NOT_VERIFIED");
    expect(requiresVerification(normalized.nextAction)).toBe(true);
    expect(requiresTwoFactor(normalized.nextAction)).toBe(false);
  });

  it("handles two factor required action payload", () => {
    const payload = {
      success: true,
      nextAction: "2fa_required",
      data: {
        code: 2001,
        message: "2FA challenge required",
      },
    };

    const normalized = normalizeAuthResponse(payload);
    expect(normalized.nextAction).toBe("2fa_required");
    expect(requiresTwoFactor(normalized.nextAction)).toBe(true);
    expect(requiresVerification(normalized.nextAction)).toBe(false);
  });

  it("handles missing token gracefully", () => {
    const payload = {
      success: false,
      message: "Invalid credentials",
    };

    const normalized = normalizeAuthResponse(payload);
    expect(normalized.token).toBeUndefined();
    expect(normalized.refreshToken).toBeUndefined();
    expect(normalized.userId).toBeUndefined();
  });
});
