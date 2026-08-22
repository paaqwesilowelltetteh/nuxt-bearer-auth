import { describe, expect, it, vi } from "vitest";

const mockPublicAuth = {
  redirects: {
    login: "/login",
    authenticated: "/dashboard",
    logout: "/",
    unauthorized: "/auth/not-allowed",
  },
  routes: {
    public: ["/", "/login", "/forgot-password", "/reset-password"],
    authPages: ["/login", "/forgot-password", "/reset-password"],
  },
};

const mockNavigateTo = vi.fn((to: any) => ({ navigatedTo: to }));

vi.mock("#app", () => ({
  defineNuxtRouteMiddleware: (fn: any) => fn,
  navigateTo: (to: any) => mockNavigateTo(to),
  useRuntimeConfig: () => ({
    public: {
      bearerAuth: mockPublicAuth,
    },
  }),
}));

const mockAuth = {
  isAuthenticated: { value: false },
  ready: { value: true },
  serverReady: { value: Promise.resolve() },
  fetchUser: vi.fn(),
};

vi.mock("../src/runtime/composables/useBearerAuth", () => ({
  useBearerAuth: () => mockAuth,
}));

import bearerAuthRouteMiddleware from "../src/runtime/middleware/bearer-auth.global";

describe("Route Middleware (bearer-auth.global.ts)", () => {
  it("allows unauthenticated navigation to public routes without redirecting", async () => {
    mockAuth.isAuthenticated.value = false;
    mockAuth.ready.value = true;
    mockNavigateTo.mockClear();

    const to = { path: "/", fullPath: "/", query: {} };
    const result = await (bearerAuthRouteMiddleware as any)(to);

    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated user trying to access protected route to /login with redirect query", async () => {
    mockAuth.isAuthenticated.value = false;
    mockAuth.ready.value = true;
    mockNavigateTo.mockClear();

    const to = { path: "/dashboard", fullPath: "/dashboard?tab=analytics", query: {} };
    const result = await (bearerAuthRouteMiddleware as any)(to);

    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: "/login",
      query: { redirect: "/dashboard?tab=analytics" },
    });
  });

  it("redirects authenticated user on authPages to /dashboard or redirect query param", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.ready.value = true;
    mockNavigateTo.mockClear();

    // Default redirect to /dashboard
    const toLogin = { path: "/login", fullPath: "/login", query: {} };
    await (bearerAuthRouteMiddleware as any)(toLogin);
    expect(mockNavigateTo).toHaveBeenCalledWith("/dashboard");

    // Redirect to specified query parameter
    mockNavigateTo.mockClear();
    const toLoginWithRedirect = {
      path: "/login",
      fullPath: "/login?redirect=/settings",
      query: { redirect: "/settings" },
    };
    await (bearerAuthRouteMiddleware as any)(toLoginWithRedirect);
    expect(mockNavigateTo).toHaveBeenCalledWith("/settings");
  });

  it("allows authenticated user to access protected routes", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.ready.value = true;
    mockNavigateTo.mockClear();

    const to = { path: "/dashboard", fullPath: "/dashboard", query: {} };
    const result = await (bearerAuthRouteMiddleware as any)(to);

    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });
});
