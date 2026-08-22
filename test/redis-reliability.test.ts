import { describe, expect, it, vi } from "vitest";

let mockConfig = {
  apiBaseUrl: "https://api.example.com",
  redisUrl: "redis://127.0.0.1:6379",
  sessionSecret: "",
  appEnv: "development",
  sessionCookie: {
    name: "nuxt_bearer_auth_session",
    devName: "nuxt_bearer_auth_session_dev",
    maxAge: 604800,
    sameSite: "lax" as const,
    path: "/",
  },
};

vi.mock("../src/runtime/server/utils/config", () => ({
  getBearerAuthConfig: () => mockConfig,
  getSessionCookieName: () => "nuxt_bearer_auth_session_dev",
  isProductionRuntime: () => false,
}));

import {
  destroyBearerAuthSession,
  getBearerAuthSession,
  getBearerAuthSessionCookie,
  requireBearerAuthSession,
} from "../src/runtime/server/utils/sessions";

describe("Redis resilience and boundary safety", () => {
  it("safely extracts session cookie or returns null if not present", () => {
    const eventWithoutCookie = {
      node: {
        req: { headers: {} },
        res: { setHeader: () => {}, getHeader: () => undefined },
      },
    } as any;
    expect(getBearerAuthSessionCookie(eventWithoutCookie)).toBeNull();

    const eventWithCookie = {
      node: {
        req: {
          headers: {
            cookie: "nuxt_bearer_auth_session_dev=valid-uuid-1234",
          },
        },
        res: { setHeader: () => {}, getHeader: () => undefined },
      },
    } as any;
    expect(getBearerAuthSessionCookie(eventWithCookie)).toBe("valid-uuid-1234");
  });

  it("destroyBearerAuthSession safely cleans cookie when session cookie is null", async () => {
    let deletedCookieName = "";
    const eventWithoutCookie = {
      node: {
        req: { headers: {} },
        res: {
          setHeader: (name: string, val: string) => {
            if (name.toLowerCase() === "set-cookie") {
              deletedCookieName = val;
            }
          },
          getHeader: () => undefined,
        },
      },
    } as any;

    await destroyBearerAuthSession(eventWithoutCookie);
    expect(deletedCookieName).toContain("nuxt_bearer_auth_session_dev");
  });

  it("requireBearerAuthSession enforces presence of userId in session context", () => {
    const eventEmpty = { context: {} } as any;
    expect(() => requireBearerAuthSession(eventEmpty)).toThrow("Unauthenticated");

    const eventWithoutUserId = { context: { auth: { token: "token-only" } } } as any;
    expect(() => requireBearerAuthSession(eventWithoutUserId)).toThrow("Unauthenticated");

    const eventValid = {
      context: {
        auth: {
          userId: "user_valid_99",
          token: "valid_tok",
        },
      },
    } as any;
    const session = requireBearerAuthSession(eventValid);
    expect(session.userId).toBe("user_valid_99");
  });
});
