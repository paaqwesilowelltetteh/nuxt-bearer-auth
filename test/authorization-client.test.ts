import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const state = vi.hoisted(() => new Map<string, { value: unknown }>());
const fetchMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("#app", () => ({
  navigateTo: navigateMock,
  useNuxtApp: vi.fn(),
  useRuntimeConfig: () => ({
    public: {
      bearerAuth: {
        redirects: {
          login: "/login",
          authenticated: "/dashboard",
          logout: "/",
          unauthorized: "/unauthorized",
        },
        routes: { localApiPrefix: "/api/auth" },
      },
    },
  }),
  useState: (key: string, factory: () => unknown) => {
    if (!state.has(key)) state.set(key, { value: factory() });
    return state.get(key);
  },
}));

vi.mock("ofetch", () => ({ $fetch: fetchMock }));

import { useBearerAuth } from "../src/runtime/composables/useBearerAuth";

describe("useBearerAuth client authorization synchronization", () => {
  beforeEach(() => {
    state.clear();
    fetchMock.mockReset();
    navigateMock.mockReset();
  });

  it("synchronizes abilities returned by login", async () => {
    fetchMock.mockResolvedValueOnce({
      success: true,
      user: { id: "u1" },
      abilities: ["campaign.create"],
    });
    const auth = useBearerAuth();

    await auth.login(
      { identifier: "user@example.com", password: "secret" },
      null,
    );

    expect(auth.can("campaign.create")).toBe(true);
    expect(auth.abilities.value).toEqual(["campaign.create"]);
  });

  it("synchronizes abilities returned by refresh", async () => {
    fetchMock.mockResolvedValueOnce({
      success: true,
      user: { id: "u1" },
      abilities: ["campaign.view"],
    });
    const auth = useBearerAuth();

    await auth.refresh();

    expect(auth.can("campaign.view")).toBe(true);
  });

  it("synchronizes abilities returned by fetchUser", async () => {
    fetchMock.mockResolvedValueOnce({
      user: { id: "u1" },
      abilities: ["campaign.view"],
    });
    const auth = useBearerAuth();

    const result = await auth.fetchUser();

    expect(result.error).toBeNull();
    expect(auth.can("campaign.view")).toBe(true);
  });

  it("preserves abilities when a later response omits authorization data", async () => {
    fetchMock
      .mockResolvedValueOnce({
        success: true,
        user: { id: "u1" },
        abilities: ["campaign.view"],
      })
      .mockResolvedValueOnce({ user: { id: "u1" } });
    const auth = useBearerAuth();

    await auth.login(
      { identifier: "user@example.com", password: "secret" },
      null,
    );
    await auth.fetchUser();
    await nextTick();

    expect(auth.can("campaign.view")).toBe(true);
  });

  it("clears abilities on logout so stale authorization state cannot persist", async () => {
    fetchMock
      .mockResolvedValueOnce({
        success: true,
        user: { id: "u1" },
        abilities: ["campaign.delete"],
      })
      // Logout endpoint response.
      .mockResolvedValueOnce({});
    const auth = useBearerAuth();

    await auth.login(
      { identifier: "user@example.com", password: "secret" },
      null,
    );
    expect(auth.can("campaign.delete")).toBe(true);

    await auth.logout();
    await nextTick();

    expect(auth.can("campaign.delete")).toBe(false);
    expect(auth.cannot("campaign.delete")).toBe(true);
    expect(auth.abilities.value).toBeNull();
  });
});
