import { describe, expect, it, vi } from "vitest";
import { createEvent } from "h3";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

let mockPublicConfig = {
  routes: {
    protectedApiPrefixes: ["/api"],
    publicApiPrefixes: [
      "/api/auth/login",
      "/api/auth/social-login",
      "/api/auth/register",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/otp-verification",
      "/api/auth/resend-otp",
      "/api/_csrf",
      "/_nuxt",
      "/__nuxt",
      "/_ipx",
      "/favicon.ico",
    ],
  },
};

vi.mock("#imports", () => ({
  useRuntimeConfig: () => ({
    public: {
      bearerAuth: mockPublicConfig,
    },
  }),
}));

const mockGetBearerAuthSession = vi.fn();
vi.mock("../src/runtime/server/utils/sessions", () => ({
  getBearerAuthSession: (...args: any[]) => mockGetBearerAuthSession(...args),
}));

vi.mock("../src/runtime/server/utils/config", () => ({
  getBearerAuthConfig: () => ({
    authorization: {
      enabled: false,
      source: "session",
      endpoint: "",
      responsePaths: {},
      rolePrefix: "role:",
    },
  }),
}));

import authServerMiddleware from "../src/runtime/server/middleware/auth";

function createMockH3Event(
  pathname: string,
  method: string = "GET",
  session: any = null,
) {
  mockGetBearerAuthSession.mockResolvedValue(session);

  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = pathname;
  req.headers = { host: "localhost:3000" };

  const res = new ServerResponse(req);
  return createEvent(req, res);
}

describe("Nitro server middleware/auth", () => {
  it("allows publicApiPrefixes without checking session", async () => {
    const event = createMockH3Event("/api/auth/login", "POST");
    await authServerMiddleware(event);
    expect(mockGetBearerAuthSession).not.toHaveBeenCalled();
    expect(event.context.auth).toBeUndefined();
  });

  it("allows safe non-protected methods (GET, HEAD, OPTIONS) without authentication", async () => {
    const event = createMockH3Event("/public-data", "GET");
    await authServerMiddleware(event);
    expect(mockGetBearerAuthSession).not.toHaveBeenCalled();
  });

  it("authenticates and attaches event.context.auth when valid session is found for protected route", async () => {
    const mockSession = {
      userId: "u1",
      token: "secret",
      profile: { name: "Alice" },
    };
    const event = createMockH3Event("/api/custom/resource", "GET", mockSession);

    await authServerMiddleware(event);
    expect(mockGetBearerAuthSession).toHaveBeenCalledWith(event);
    expect(event.context.auth).toEqual(mockSession);
  });

  it("throws 401 on protectedApiPrefixes when no session exists", async () => {
    const event = createMockH3Event("/api/custom/resource", "GET", null);

    await expect(authServerMiddleware(event)).rejects.toThrow(
      "Authentication required",
    );
  });

  it("throws 401 on POST to non-public /api route when no session exists", async () => {
    const event = createMockH3Event("/api/projects", "POST", null);

    await expect(authServerMiddleware(event)).rejects.toThrow(
      "Authentication required",
    );
  });
});
