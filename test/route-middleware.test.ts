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
  authorizationEnabled: true,
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
  abilities: { value: null as string[] | null },
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

    const to = { path: "/", fullPath: "/", query: {}, meta: {} };
    const result = await (bearerAuthRouteMiddleware as any)(to);

    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated user trying to access protected route to /login with redirect query", async () => {
    mockAuth.isAuthenticated.value = false;
    mockAuth.ready.value = true;
    mockNavigateTo.mockClear();

    const to = {
      path: "/dashboard",
      fullPath: "/dashboard?tab=analytics",
      query: {},
      meta: {},
    };
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
    const toLogin = { path: "/login", fullPath: "/login", query: {}, meta: {} };
    await (bearerAuthRouteMiddleware as any)(toLogin);
    expect(mockNavigateTo).toHaveBeenCalledWith("/dashboard");

    // Redirect to specified query parameter
    mockNavigateTo.mockClear();
    const toLoginWithRedirect = {
      path: "/login",
      fullPath: "/login?redirect=/settings",
      query: { redirect: "/settings" },
      meta: {},
    };
    await (bearerAuthRouteMiddleware as any)(toLoginWithRedirect);
    expect(mockNavigateTo).toHaveBeenCalledWith("/settings");
  });

  it("allows authenticated user to access protected routes", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.ready.value = true;
    mockNavigateTo.mockClear();

    const to = {
      path: "/dashboard",
      fullPath: "/dashboard",
      query: {},
      meta: {},
    };
    const result = await (bearerAuthRouteMiddleware as any)(to);

    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("allows an authenticated user with the required ability", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.abilities.value = ["users.view"];
    mockNavigateTo.mockClear();

    const result = await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.view"] } },
    });

    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("redirects an authenticated user without the required ability", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.abilities.value = ["users.view"];
    mockNavigateTo.mockClear();

    await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.delete"] } },
    });

    expect(mockNavigateTo).toHaveBeenCalledWith("/auth/not-allowed");
  });

  it("supports explicit any matching for multiple abilities", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.abilities.value = ["reports.view"];
    mockNavigateTo.mockClear();

    await (bearerAuthRouteMiddleware as any)({
      path: "/reports",
      fullPath: "/reports",
      query: {},
      meta: {
        authorization: {
          abilities: ["reports.view", "reports.edit"],
          mode: "any",
        },
      },
    });

    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("redirects when no required ability matches in any mode", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.abilities.value = ["reports.export"];
    mockNavigateTo.mockClear();

    await (bearerAuthRouteMiddleware as any)({
      path: "/reports",
      fullPath: "/reports",
      query: {},
      meta: {
        authorization: {
          abilities: ["reports.view", "reports.edit"],
          mode: "any",
        },
      },
    });

    expect(mockNavigateTo).toHaveBeenCalledWith("/auth/not-allowed");
  });

  it("requires every ability when mode is explicitly all", async () => {
    mockAuth.isAuthenticated.value = true;
    mockNavigateTo.mockClear();

    const requirement = {
      abilities: ["users.view", "users.edit"],
      mode: "all" as const,
    };

    mockAuth.abilities.value = ["users.view"];
    await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: requirement },
    });
    expect(mockNavigateTo).toHaveBeenCalledWith("/auth/not-allowed");

    mockNavigateTo.mockClear();
    mockAuth.abilities.value = ["users.view", "users.edit"];
    const result = await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: requirement },
    });
    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("defaults to all semantics when mode is omitted", async () => {
    mockAuth.isAuthenticated.value = true;
    mockNavigateTo.mockClear();

    // Only one of two required abilities: default (all) must reject.
    mockAuth.abilities.value = ["users.view"];
    await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.view", "users.edit"] } },
    });
    expect(mockNavigateTo).toHaveBeenCalledWith("/auth/not-allowed");

    mockNavigateTo.mockClear();
    mockAuth.abilities.value = ["users.view", "users.edit"];
    const result = await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.view", "users.edit"] } },
    });
    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("matches abilities exactly and never expands wildcards or prefixes", async () => {
    mockAuth.isAuthenticated.value = true;
    mockNavigateTo.mockClear();

    // Holding "users.*" does not satisfy "users.view".
    mockAuth.abilities.value = ["users.*"];
    await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.view"] } },
    });
    expect(mockNavigateTo).toHaveBeenCalledWith("/auth/not-allowed");

    // Holding "users.view" does not satisfy a literal "users.*" requirement.
    mockNavigateTo.mockClear();
    mockAuth.abilities.value = ["users.view"];
    await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.*"] } },
    });
    expect(mockNavigateTo).toHaveBeenCalledWith("/auth/not-allowed");

    // Prefix sharing ("users.view.edit") does not satisfy "users.view".
    mockNavigateTo.mockClear();
    mockAuth.abilities.value = ["users.view.edit"];
    await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.view"] } },
    });
    expect(mockNavigateTo).toHaveBeenCalledWith("/auth/not-allowed");
  });

  it("keeps unauthenticated users on the authentication flow even when a route requires abilities", async () => {
    mockAuth.isAuthenticated.value = false;
    mockAuth.abilities.value = null;
    mockNavigateTo.mockClear();

    await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.view"] } },
    });

    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: "/login",
      query: { redirect: "/admin/users" },
    });
    expect(mockNavigateTo).not.toHaveBeenCalledWith("/auth/not-allowed");
  });

  it("continues normally when authorization is disabled even if metadata exists", async () => {
    mockPublicAuth.authorizationEnabled = false;
    try {
      mockAuth.isAuthenticated.value = true;
      mockAuth.abilities.value = null;
      mockNavigateTo.mockClear();

      const result = await (bearerAuthRouteMiddleware as any)({
        path: "/admin/users",
        fullPath: "/admin/users",
        query: {},
        meta: { authorization: { abilities: ["users.view"] } },
      });

      expect(result).toBeUndefined();
      expect(mockNavigateTo).not.toHaveBeenCalled();
    } finally {
      mockPublicAuth.authorizationEnabled = true;
    }
  });

  it("redirects unauthorized users to the configured custom unauthorized route", async () => {
    mockPublicAuth.redirects.unauthorized = "/custom/no-access";
    try {
      mockAuth.isAuthenticated.value = true;
      mockAuth.abilities.value = ["users.view"];
      mockNavigateTo.mockClear();

      await (bearerAuthRouteMiddleware as any)({
        path: "/admin/users",
        fullPath: "/admin/users",
        query: {},
        meta: { authorization: { abilities: ["users.delete"] } },
      });

      expect(mockNavigateTo).toHaveBeenCalledWith("/custom/no-access");
    } finally {
      mockPublicAuth.redirects.unauthorized = "/auth/not-allowed";
    }
  });

  it("leaves routes without authorization metadata unaffected for authenticated users", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.abilities.value = null;
    mockNavigateTo.mockClear();

    const result = await (bearerAuthRouteMiddleware as any)({
      path: "/settings/profile",
      fullPath: "/settings/profile",
      query: {},
      meta: {},
    });

    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("handles duplicate abilities in requirements without side effects", async () => {
    mockAuth.isAuthenticated.value = true;
    mockNavigateTo.mockClear();

    // Duplicates in "all" mode: satisfied when the (deduplicated) set is held.
    mockAuth.abilities.value = ["users.view"];
    const result = await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: {
        authorization: { abilities: ["users.view", "users.view"] },
      },
    });
    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("matches route metadata case-sensitively", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.abilities.value = ["Users.View"];
    mockNavigateTo.mockClear();

    await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.view"] } },
    });

    expect(mockNavigateTo).toHaveBeenCalledWith("/auth/not-allowed");
  });

  it("treats an empty abilities array in metadata as no restriction", async () => {
    mockAuth.isAuthenticated.value = true;
    mockAuth.abilities.value = null;
    mockNavigateTo.mockClear();

    const result = await (bearerAuthRouteMiddleware as any)({
      path: "/anyone",
      fullPath: "/anyone",
      query: {},
      meta: {
        authorization: { abilities: [], mode: "any" },
      },
    });

    expect(result).toBeUndefined();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("fails closed when client ability state is malformed instead of crashing", async () => {
    mockPublicAuth.authorizationEnabled = true;
    mockAuth.isAuthenticated.value = true;
    // Simulate corrupted state reaching the middleware (wrong type).
    (mockAuth.abilities as { value: unknown }).value = "users.view";
    mockNavigateTo.mockClear();

    await (bearerAuthRouteMiddleware as any)({
      path: "/admin/users",
      fullPath: "/admin/users",
      query: {},
      meta: { authorization: { abilities: ["users.view"] } },
    });

    expect(mockNavigateTo).toHaveBeenCalledWith("/auth/not-allowed");
  });
});
