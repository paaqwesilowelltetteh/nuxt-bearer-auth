import { describe, expect, it } from "vitest";
import { interpolatePath, readFirstPath, readPath } from "../src/runtime/server/utils/paths";

describe("paths utility", () => {
  describe("readPath", () => {
    it("returns undefined for empty path", () => {
      expect(readPath({ a: 1 }, "")).toBeUndefined();
    });

    it("returns source itself when path is '$'", () => {
      const source = { id: 10, name: "Alice" };
      expect(readPath(source, "$")).toBe(source);
    });

    it("reads direct property", () => {
      const source = { token: "secret-token-123" };
      expect(readPath(source, "token")).toBe("secret-token-123");
    });

    it("reads nested properties with dot notation", () => {
      const source = {
        data: {
          user: {
            profile: {
              email: "test@example.com",
            },
          },
        },
      };
      expect(readPath(source, "data.user.profile.email")).toBe("test@example.com");
    });

    it("returns undefined for non-existent path", () => {
      const source = { user: { name: "Bob" } };
      expect(readPath(source, "user.email")).toBeUndefined();
      expect(readPath(source, "data.token")).toBeUndefined();
    });

    it("safely handles null and undefined intermediate values", () => {
      const source = { data: null };
      expect(readPath(source, "data.user.id")).toBeUndefined();
      expect(readPath(null, "user.id")).toBeUndefined();
      expect(readPath(undefined, "user.id")).toBeUndefined();
    });

    it("safely handles primitive values when object path expected", () => {
      const source = { data: "string-value" };
      expect(readPath(source, "data.user.id")).toBeUndefined();
    });
  });

  describe("readFirstPath", () => {
    it("returns first matched path", () => {
      const source = {
        access_token: "jwt-token",
        token: "fallback-token",
      };
      const candidatePaths = ["data.token", "access_token", "token"];
      expect(readFirstPath(source, candidatePaths)).toBe("jwt-token");
    });

    it("skips undefined and null candidates", () => {
      const source = {
        token: null,
        bearer_token: "valid-bearer",
      };
      const candidatePaths = ["data.token", "token", "bearer_token"];
      expect(readFirstPath(source, candidatePaths)).toBe("valid-bearer");
    });

    it("returns undefined when no candidate paths match", () => {
      const source = { message: "ok" };
      expect(readFirstPath(source, ["token", "data.token"])).toBeUndefined();
    });

    it("returns undefined for empty candidates array", () => {
      expect(readFirstPath({ token: "abc" }, [])).toBeUndefined();
    });
  });

  describe("interpolatePath", () => {
    it("replaces route parameters with encoded values", () => {
      const endpoint = "auth/resend-otp/:identifier";
      const result = interpolatePath(endpoint, { identifier: "john+doe@example.com" });
      expect(result).toBe("auth/resend-otp/john%2Bdoe%40example.com");
    });

    it("handles multiple parameters", () => {
      const endpoint = "users/:userId/sessions/:sessionId";
      const result = interpolatePath(endpoint, { userId: "user-123", sessionId: "sess 456" });
      expect(result).toBe("users/user-123/sessions/sess%20456");
    });

    it("handles missing/undefined parameters gracefully by replacing with empty string", () => {
      const endpoint = "auth/resend-otp/:identifier";
      const result = interpolatePath(endpoint, { identifier: undefined });
      expect(result).toBe("auth/resend-otp/");
    });
  });
});
