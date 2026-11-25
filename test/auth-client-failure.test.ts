import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  state: new Map<string, any>(),
  fetch: vi.fn(),
  navigateTo: vi.fn(),
  broadcast: vi.fn(),
}));

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({
    public: {
      bearerAuth: {
        routes: { localApiPrefix: "/api/auth" },
        redirects: {
          login: "/login",
          authenticated: "/dashboard",
          logout: "/",
          unauthorized: "/forbidden",
        },
        sessionLiveness: { crossTab: true, channelName: "test-auth" },
      },
    },
  }),
  useState: (key: string, factory: () => unknown) => {
    if (!mocks.state.has(key)) mocks.state.set(key, ref(factory()));
    return mocks.state.get(key);
  },
  navigateTo: mocks.navigateTo,
}));

vi.mock("ofetch", () => ({ $fetch: mocks.fetch }));
vi.mock("../src/runtime/utils/session-sync", () => ({
  broadcastBearerAuthSessionInvalidation: mocks.broadcast,
}));

import { useBearerAuth } from "../src/runtime/composables/useBearerAuth";

describe("useBearerAuth transient request failures", () => {
  beforeEach(() => {
    mocks.state.clear();
    mocks.fetch.mockReset();
    mocks.navigateTo.mockReset();
    mocks.broadcast.mockReset();
  });

  it("preserves the authenticated snapshot when fetchUser fails with a server error", async () => {
    const auth = useBearerAuth();
    auth.setUser({ id: "user-1", name: "Alice" });
    auth.setAbilities(["reports.view"]);
    auth.setAuthReady(true);
    mocks.fetch.mockRejectedValueOnce({ statusCode: 503, message: "Unavailable" });

    const result = await auth.fetchUser();

    expect(result.data).toEqual({ id: "user-1", name: "Alice" });
    expect(auth.user.value).toEqual({ id: "user-1", name: "Alice" });
    expect(auth.abilities.value).toEqual(["reports.view"]);
    expect(auth.status.value).toBe("authenticated");
    expect(result.error).toBeTruthy();
  });

  it("clears the snapshot only when fetchUser receives a confirmed 401", async () => {
    const auth = useBearerAuth();
    auth.setUser({ id: "user-1" });
    auth.setAuthReady(true);
    mocks.fetch.mockRejectedValueOnce({ statusCode: 401, message: "Unauthenticated" });

    const result = await auth.fetchUser();

    expect(result.data).toBeNull();
    expect(auth.user.value).toBeNull();
    expect(auth.status.value).toBe("unauthenticated");
  });

  it("marks an initial auth lookup unavailable instead of redirecting as anonymous", async () => {
    const auth = useBearerAuth();
    mocks.fetch.mockRejectedValueOnce(new Error("Network unavailable"));

    await auth.fetchUser();

    expect(auth.status.value).toBe("unavailable");
    expect(auth.isAuthenticated.value).toBe(false);
  });

  it("does not broadcast logout when the request fails before local revocation is confirmed", async () => {
    const auth = useBearerAuth();
    auth.setUser({ id: "user-1" });
    auth.setAuthReady(true);
    mocks.fetch.mockRejectedValueOnce(new Error("Network request failed"));

    await expect(auth.logout()).rejects.toThrow("Network request failed");

    expect(auth.user.value).toBeNull();
    expect(auth.status.value).toBe("unauthenticated");
    expect(mocks.broadcast).not.toHaveBeenCalled();
    expect(mocks.navigateTo).toHaveBeenCalledWith("/");
  });

  it("broadcasts logout after the local endpoint confirms revocation", async () => {
    const auth = useBearerAuth();
    auth.setUser({ id: "user-1" });
    auth.setAuthReady(true);
    mocks.fetch.mockResolvedValueOnce({ success: true });

    await auth.logout();

    expect(mocks.broadcast).toHaveBeenCalledWith("test-auth");
  });
});
