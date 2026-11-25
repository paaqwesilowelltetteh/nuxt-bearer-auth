// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";

const state = vi.hoisted(() => new Map<string, { value: unknown }>());
const fetchMock = vi.hoisted(() => vi.fn());
const clearAuthState = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  ready: { value: true },
  isAuthenticated: { value: true },
  status: { value: "authenticated" },
  clearAuthState,
}));

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({
    public: {
      bearerAuth: {
        routes: { localApiPrefix: "/api/auth" },
        sessionLiveness: {
          enabled: false,
          crossTab: false,
          minIntervalMs: 0,
        },
      },
    },
  }),
  useState: (key: string, factory: () => unknown) => {
    if (!state.has(key)) state.set(key, { value: factory() });
    return state.get(key);
  },
  useRouter: () => ({ afterEach: vi.fn(() => vi.fn()) }),
}));

vi.mock("ofetch", () => ({ $fetch: fetchMock }));
vi.mock("../src/runtime/composables/useBearerAuth", () => ({
  useBearerAuth: () => auth,
}));
vi.mock("../src/runtime/utils/session-sync", () => ({
  broadcastBearerAuthSessionInvalidation: vi.fn(),
  listenForBearerAuthSessionInvalidation: vi.fn(() => vi.fn()),
}));

import { useBearerAuthSession } from "../src/runtime/composables/useBearerAuthSession";

function setup() {
  let session!: ReturnType<typeof useBearerAuthSession>;
  const wrapper = mount(
    defineComponent({
      setup() {
        session = useBearerAuthSession();
        return () => h("div");
      },
    }),
  );
  return { session, wrapper };
}

describe("useBearerAuthSession", () => {
  beforeEach(() => {
    state.clear();
    fetchMock.mockReset();
    clearAuthState.mockReset();
    auth.ready.value = true;
    auth.isAuthenticated.value = true;
    auth.status.value = "authenticated";
  });

  it("validates successfully without changing auth status or reloading profile", async () => {
    fetchMock.mockResolvedValueOnce({ valid: true });
    const { session, wrapper } = setup();

    await expect(session.validate({ force: true })).resolves.toBe("valid");
    expect(session.validity.value).toBe("valid");
    expect(auth.status.value).toBe("authenticated");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ method: "GET", retry: 0 }),
    );
    expect(clearAuthState).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("treats a 401 as confirmed invalidation", async () => {
    fetchMock.mockRejectedValueOnce({ statusCode: 401 });
    const { session, wrapper } = setup();

    await expect(session.validate({ force: true })).resolves.toBe("invalid");
    expect(session.validity.value).toBe("invalid");
    expect(clearAuthState).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("does not log out when the validation service is unavailable", async () => {
    fetchMock.mockRejectedValueOnce({ statusCode: 503, message: "Unavailable" });
    const { session, wrapper } = setup();

    await expect(session.validate({ force: true })).resolves.toBe("unavailable");
    expect(session.validity.value).toBe("unavailable");
    expect(auth.status.value).toBe("authenticated");
    expect(clearAuthState).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("shares concurrent validation probes", async () => {
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { session, wrapper } = setup();

    const first = session.validate({ force: true });
    const second = session.validate({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ valid: true });
    await expect(Promise.all([first, second])).resolves.toEqual([
      "valid",
      "valid",
    ]);
    wrapper.unmount();
  });
});
