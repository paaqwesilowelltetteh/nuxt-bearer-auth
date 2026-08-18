import { navigateTo, useNuxtApp, useRuntimeConfig, useState } from "#app";
import { computed, watch } from "vue";
import { $fetch } from "ofetch";

import type {
  AuthApiResponse,
  AuthStatus,
  BearerAuthUser,
  FetchUserOptions,
  LoginCredentials,
  SocialLoginCredentials,
} from "../types/auth";

// nuxt-csurf v1.6+ returns { csrf, headerName } from useCsrf() — no csrfFetch property.
// The CSRF-aware fetcher is instead provided as $csrfFetch via useNuxtApp().
declare const useCsrf:
  | undefined
  | (() => { csrf?: string; headerName?: string; csrfFetch?: typeof $fetch });

let serverCheckPromise: Promise<void> | null = null;
let serverCheckResolve: (() => void) | null = null;

async function authFetch<T>(
  request: string,
  options: Parameters<typeof $fetch>[1] = {},
) {
  try {
    // nuxt-csurf v1.6+ provides $csrfFetch on the Nuxt app instance (via its own plugin).
    // Fall back to useCsrf()?.csrfFetch for older versions, then to plain $fetch.
    let fetcher: typeof $fetch = $fetch;

    if (import.meta.client) {
      try {
        const nuxtApp = useNuxtApp();
        const $csrfFetch = (nuxtApp as any).$csrfFetch as typeof $fetch | undefined;
        if ($csrfFetch) {
          fetcher = $csrfFetch;
        } else if (typeof useCsrf === "function") {
          fetcher = useCsrf()?.csrfFetch || $fetch;
        }
      } catch {
        // useNuxtApp() may throw outside a Nuxt context — safe to ignore
      }
    }

    return await fetcher<T>(request, options);
  } catch (error) {
    throw error;
  }
}

export function useBearerAuth<User extends BearerAuthUser = BearerAuthUser>() {
  const config = useRuntimeConfig();
  const publicAuth = config.public.bearerAuth as {
    redirects: {
      login: string;
      authenticated: string;
      logout: string;
      unauthorized: string;
    };
    routes: {
      localApiPrefix: string;
    };
  };
  const apiPrefix = publicAuth.routes.localApiPrefix || "/api/auth";

  const user = useState<User | null>("bearer-auth-user", () => null);
  const status = useState<AuthStatus>("bearer-auth-status", () => "idle");
  const ready = useState<boolean>("bearer-auth-ready", () => false);
  const error = useState<string | null>("bearer-auth-error", () => null);
  const serverChecked = useState<boolean>("bearer-auth-server-checked", () => false);

  const serverReady = computed(() => {
    if (import.meta.client || serverChecked.value) {
      return Promise.resolve();
    }

    if (!serverCheckPromise) {
      serverCheckPromise = new Promise<void>((resolve) => {
        serverCheckResolve = resolve;
      });
    }

    return serverCheckPromise;
  });

  const loading = computed(() => status.value === "loading");
  const isAuthenticated = computed(() => status.value === "authenticated");

  function resolveErrorMessage(err: unknown, fallback: string) {
    if (err instanceof Error) return err.message;
    if (
      typeof err === "object" &&
      err !== null &&
      "data" in err &&
      typeof (err as { data?: { message?: string; statusMessage?: string } }).data ===
        "object"
    ) {
      const data = (err as { data?: { message?: string; statusMessage?: string } })
        .data;
      return data?.message || data?.statusMessage || fallback;
    }

    return fallback;
  }

  async function completeAuthenticatedFlow(
    authenticatedUser: User | null | undefined,
    redirectPath?: string | null,
  ) {
    user.value = authenticatedUser || null;
    status.value = authenticatedUser ? "authenticated" : "unauthenticated";
    ready.value = true;

    if (redirectPath !== null) {
      await navigateTo(redirectPath || publicAuth.redirects.authenticated);
    }
  }

  async function login(credentials: LoginCredentials, redirectPath?: string | null) {
    status.value = "loading";
    error.value = null;

    try {
      const response = await authFetch<AuthApiResponse<User>>(`${apiPrefix}/login`, {
        method: "POST",
        body: credentials,
      });

      if (response.user && !response.nextAction) {
        await completeAuthenticatedFlow(response.user as User, redirectPath);
      } else {
        user.value = (response.user as User) || null;
        status.value = "unauthenticated";
        ready.value = true;
      }

      return response;
    } catch (err) {
      error.value = resolveErrorMessage(err, "Login failed");
      status.value = "unauthenticated";
      ready.value = true;
      throw err;
    }
  }

  async function socialLogin(
    credentials: SocialLoginCredentials,
    redirectPath?: string | null,
  ) {
    status.value = "loading";
    error.value = null;

    try {
      const response = await authFetch<AuthApiResponse<User>>(
        `${apiPrefix}/social-login`,
        {
          method: "POST",
          body: credentials,
        },
      );

      await completeAuthenticatedFlow((response.user as User) || null, redirectPath);
      return response;
    } catch (err) {
      error.value = resolveErrorMessage(err, "Social login failed");
      status.value = "unauthenticated";
      ready.value = true;
      throw err;
    }
  }

  async function register(
    payload: Record<string, unknown>,
    redirectPath?: string | null,
  ) {
    status.value = "loading";
    error.value = null;

    try {
      const response = await authFetch<AuthApiResponse<User>>(`${apiPrefix}/register`, {
        method: "POST",
        body: payload,
      });

      if (response.user) {
        await completeAuthenticatedFlow(response.user as User, redirectPath);
      } else {
        status.value = "unauthenticated";
        ready.value = true;
      }

      return response;
    } catch (err) {
      error.value = resolveErrorMessage(err, "Registration failed");
      status.value = "unauthenticated";
      ready.value = true;
      throw err;
    }
  }

  async function verifyOtp(
    payload: Record<string, unknown>,
    redirectPath?: string | null,
  ) {
    status.value = "loading";
    error.value = null;

    try {
      const response = await authFetch<AuthApiResponse<User>>(
        `${apiPrefix}/otp-verification`,
        {
          method: "POST",
          body: payload,
        },
      );

      if (response.user) {
        await completeAuthenticatedFlow(response.user as User, redirectPath);
      } else {
        status.value = "unauthenticated";
        ready.value = true;
      }

      return response;
    } catch (err) {
      error.value = resolveErrorMessage(err, "OTP verification failed");
      status.value = "unauthenticated";
      ready.value = true;
      throw err;
    }
  }

  async function fetchUser(options: FetchUserOptions = {}) {
    if (status.value === "loading") {
      return new Promise<{ data: User | null; error: string | null }>((resolve) => {
        const unwatch = watch(status, (newStatus) => {
          if (newStatus !== "loading") {
            unwatch();
            resolve({ data: user.value, error: error.value });
          }
        });
      });
    }

    status.value = "loading";
    error.value = null;

    try {
      const query = options.refresh ? "?refresh=true" : "";
      const response = await authFetch<{ user: User | null }>(
        `${apiPrefix}/me${query}`,
        {
          method: "GET",
        },
      );

      user.value = response.user || null;
      status.value = user.value ? "authenticated" : "unauthenticated";
      ready.value = true;

      return { data: user.value, error: null };
    } catch (err) {
      clearAuthState();
      ready.value = true;
      error.value = resolveErrorMessage(err, "Session expired");
      return { data: null, error: error.value };
    }
  }

  async function refresh() {
    try {
      const response = await authFetch<AuthApiResponse<User>>(`${apiPrefix}/refresh`, {
        method: "POST",
      });

      if (response.user) {
        user.value = response.user as User;
        status.value = "authenticated";
      }

      ready.value = true;
      return response;
    } catch (err) {
      clearAuthState();
      ready.value = true;
      throw err;
    }
  }

  async function logout(destination = publicAuth.redirects.logout) {
    status.value = "loading";
    error.value = null;

    try {
      await authFetch(`${apiPrefix}/logout`, { method: "POST" });
    } finally {
      clearAuthState();
      ready.value = true;
      await navigateTo(destination);
    }
  }

  async function forgotPassword(payload: Record<string, unknown>) {
    return await authFetch(`${apiPrefix}/forgot-password`, {
      method: "POST",
      body: payload,
    });
  }

  async function resetPassword(payload: Record<string, unknown>) {
    return await authFetch(`${apiPrefix}/reset-password`, {
      method: "POST",
      body: payload,
    });
  }

  async function resendOtp(identifier: string, payload: Record<string, unknown> = {}) {
    return await authFetch(`${apiPrefix}/resend-otp/${encodeURIComponent(identifier)}`, {
      method: "POST",
      body: payload,
    });
  }

  function setServerChecked() {
    if (import.meta.server) {
      serverChecked.value = true;
      serverCheckResolve?.();
    }
  }

  function setAuthReady(value: boolean) {
    ready.value = value;
  }

  function setUser(value: User | null) {
    user.value = value;
    status.value = value ? "authenticated" : "unauthenticated";
  }

  function clearAuthState() {
    user.value = null;
    error.value = null;
    status.value = "unauthenticated";
  }

  return {
    user,
    status,
    ready,
    error,
    loading,
    isAuthenticated,
    serverReady,
    login,
    socialLogin,
    register,
    verifyOtp,
    fetchUser,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
    resendOtp,
    setUser,
    setAuthReady,
    setServerChecked,
    clearAuthState,
  };
}
