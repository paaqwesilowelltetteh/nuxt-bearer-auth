// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({
  state: new Map<string, { value: unknown }>(),
  fetch: vi.fn(),
  clearAuthState: vi.fn(),
  auth: {} as Record<string, any>,
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
    if (!mocks.state.has(key)) mocks.state.set(key, { value: factory() });
    return mocks.state.get(key);
  },
  useRouter: () => ({ afterEach: vi.fn(() => vi.fn()) }),
}));

vi.mock("ofetch", () => ({ $fetch: mocks.fetch }));
vi.mock("../src/runtime/composables/useBearerAuth", () => ({
  useBearerAuth: () => mocks.auth,
}));
vi.mock("../src/runtime/utils/session-sync", () => ({
  broadcastBearerAuthSessionInvalidation: vi.fn(),
  listenForBearerAuthSessionInvalidation: vi.fn(() => vi.fn()),
}));

import { useBearerAuthSession } from "../src/runtime/composables/useBearerAuthSession";
import type { UseBearerAuthSessionOptions } from "../src/types";

function setup(options: UseBearerAuthSessionOptions = {}) {
  let session!: ReturnType<typeof useBearerAuthSession>;
  const wrapper = mount(
    defineComponent({
      setup() {
        session = useBearerAuthSession(options);
        return () => h("div");
      },
    }),
  );
  return { session, wrapper };
}

describe("useBearerAuthSession", () => {
  beforeEach(() => {
    mocks.state.clear();
    mocks.fetch.mockReset();
    mocks.clearAuthState.mockReset();
    Object.assign(mocks.auth, {
      ready: ref(true),
      isAuthenticated: ref(true),
      status: ref("authenticated"),
      clearAuthState: mocks.clearAuthState,
    });
  });

  it("validates successfully without changing auth status or reloading profile", async () => {
    mocks.fetch.mockResolvedValueOnce({ valid: true });
    const { session, wrapper } = setup();

    await expect(session.validate({ force: true })).resolves.toBe("valid");
    expect(session.validity.value).toBe("valid");
    expect(mocks.auth.status.value).toBe("authenticated");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ method: "GET", retry: 0 }),
    );
    expect(mocks.clearAuthState).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("treats a 401 as confirmed invalidation", async () => {
    mocks.fetch.mockRejectedValueOnce({ statusCode: 401 });
    const { session, wrapper } = setup();

    await expect(session.validate({ force: true })).resolves.toBe("invalid");
    expect(session.validity.value).toBe("invalid");
    expect(mocks.clearAuthState).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("does not log out when the validation service is unavailable", async () => {
    mocks.fetch.mockRejectedValueOnce({ statusCode: 503, message: "Unavailable" });
    const { session, wrapper } = setup();

    await expect(session.validate({ force: true })).resolves.toBe("unavailable");
    expect(session.validity.value).toBe("unavailable");
    expect(mocks.auth.status.value).toBe("authenticated");
    expect(mocks.clearAuthState).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("throttles repeated probes within the configured minimum interval", async () => {
    mocks.fetch.mockResolvedValue({ valid: true });
    const { session, wrapper } = setup({ minIntervalMs: 60_000 });

    await expect(session.validate({ force: true })).resolves.toBe("valid");
    await expect(session.validate()).resolves.toBe("valid");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("does nothing when no authenticated session exists", async () => {
    Object.assign(mocks.auth, {
      ready: ref(true),
      isAuthenticated: ref(false),
      status: ref("unauthenticated"),
      clearAuthState: mocks.clearAuthState,
    });
    const { session, wrapper } = setup();

    await expect(session.validate({ force: true })).resolves.toBe("skipped");
    expect(mocks.fetch).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("starts a fresh probe after an auth transition while an older probe is pending", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    mocks.fetch.mockResolvedValueOnce({ valid: true });

    const { session, wrapper } = setup();
    const oldProbe = session.validate({ force: true });

    // Simulate logout followed by a new login while the old request is pending.
    mocks.auth.status.value = "loading";
    mocks.auth.isAuthenticated.value = false;
    await nextTick();
    mocks.auth.status.value = "authenticated";
    mocks.auth.isAuthenticated.value = true;
    await nextTick();

    const newProbe = session.validate({ force: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    resolveOld({ valid: true });
    await expect(oldProbe).resolves.toBe("skipped");
    await expect(newProbe).resolves.toBe("valid");
    expect(session.validity.value).toBe("valid");
    wrapper.unmount();
  });

  it("runs configured periodic, focus, and visibility checks and cleans up", async () => {
    vi.useFakeTimers();
    const visibilityState = { value: "visible" };
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState.value,
    });
    mocks.fetch.mockResolvedValue({ valid: true });
    const { wrapper } = setup({
      enabled: true,
      intervalMs: 1000,
      minIntervalMs: 0,
      validateOnMount: true,
      validateOnFocus: true,
      validateOnVisibilityChange: true,
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);

    visibilityState.value = "visible";
    expect(document.visibilityState).toBe("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(4);

    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event("focus"));
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("shares concurrent validation probes", async () => {
    let resolveFetch!: (value: unknown) => void;
    mocks.fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { session, wrapper } = setup();

    const first = session.validate({ force: true });
    const second = session.validate({ force: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    resolveFetch({ valid: true });
    await expect(Promise.all([first, second])).resolves.toEqual([
      "valid",
      "valid",
    ]);
    wrapper.unmount();
  });
});
