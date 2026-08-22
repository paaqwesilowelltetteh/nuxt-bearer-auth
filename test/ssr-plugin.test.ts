import { describe, expect, it, vi } from "vitest";

const mockGetBearerAuthSession = vi.fn();
vi.mock("../src/runtime/server/utils/sessions", () => ({
  getBearerAuthSession: (...args: any[]) => mockGetBearerAuthSession(...args),
}));

const mockAuth = {
  setUser: vi.fn(),
  clearAuthState: vi.fn(),
  setAuthReady: vi.fn(),
  setServerChecked: vi.fn(),
};

vi.mock("../src/runtime/composables/useBearerAuth", () => ({
  useBearerAuth: () => mockAuth,
}));

vi.mock("#app", () => ({
  defineNuxtPlugin: (fn: any) => fn,
}));

import bearerAuthServerPlugin from "../src/runtime/plugins/bearer-auth.server";

describe("SSR Server Plugin (bearer-auth.server.ts)", () => {
  it("populates payload with user and marks ready when authenticated session exists", async () => {
    mockGetBearerAuthSession.mockResolvedValueOnce({
      userId: "u123",
      token: "secret",
      profile: { id: "u123", name: "Alice", email: "alice@example.com" },
    });

    const nuxtApp = {
      ssrContext: {
        event: { node: {}, context: {} },
      },
      payload: {} as any,
    };

    await (bearerAuthServerPlugin as any)(nuxtApp);

    expect(mockAuth.setUser).toHaveBeenCalledWith({
      id: "u123",
      name: "Alice",
      email: "alice@example.com",
    });
    expect(nuxtApp.payload.bearerAuth).toEqual({
      user: { id: "u123", name: "Alice", email: "alice@example.com" },
      status: "authenticated",
    });
    expect(mockAuth.setAuthReady).toHaveBeenCalledWith(true);
    expect(mockAuth.setServerChecked).toHaveBeenCalled();
  });

  it("handles unauthenticated SSR request safely without throwing or hanging", async () => {
    mockGetBearerAuthSession.mockResolvedValueOnce(null);

    const nuxtApp = {
      ssrContext: {
        event: { node: {}, context: {} },
      },
      payload: {} as any,
    };

    await (bearerAuthServerPlugin as any)(nuxtApp);

    expect(mockAuth.setUser).toHaveBeenCalledWith(null);
    expect(nuxtApp.payload.bearerAuth).toEqual({
      user: null,
      status: "unauthenticated",
    });
    expect(mockAuth.setAuthReady).toHaveBeenCalledWith(true);
    expect(mockAuth.setServerChecked).toHaveBeenCalled();
  });

  it("handles Redis error during SSR hydration safely without hanging", async () => {
    mockGetBearerAuthSession.mockRejectedValueOnce(new Error("Redis connection dropped"));

    const nuxtApp = {
      ssrContext: {
        event: { node: {}, context: {} },
      },
      payload: {} as any,
    };

    await (bearerAuthServerPlugin as any)(nuxtApp);

    expect(mockAuth.clearAuthState).toHaveBeenCalled();
    expect(nuxtApp.payload.bearerAuth).toEqual({
      user: null,
      status: "unauthenticated",
    });
    expect(mockAuth.setAuthReady).toHaveBeenCalledWith(true);
    expect(mockAuth.setServerChecked).toHaveBeenCalled();
  });
});
