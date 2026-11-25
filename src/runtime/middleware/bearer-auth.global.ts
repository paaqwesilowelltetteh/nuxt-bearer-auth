import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from "#app";
import { watch } from "vue";
import { useBearerAuth } from "../composables/useBearerAuth";
import type { AuthorizationRouteRequirement } from "../../types";

function hasRequiredAbilities(
  abilities: string[] | null | undefined,
  requirement: AuthorizationRouteRequirement,
) {
  if (requirement.abilities.length === 0) return true;
  // Fail closed: malformed or missing client-side authorization state must
  // never grant access (mirrors the server-side helper).
  if (!Array.isArray(abilities) || abilities.length === 0) return false;

  return requirement.mode === "any"
    ? requirement.abilities.some((ability) => abilities.includes(ability))
    : requirement.abilities.every((ability) => abilities.includes(ability));
}

export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig();
  const publicAuth = config.public.bearerAuth as {
    redirects: {
      login: string;
      authenticated: string;
      unauthorized: string;
    };
    routes: {
      public: string[];
      authPages: string[];
    };
    authorizationEnabled?: boolean;
  };

  const auth = useBearerAuth();
  const isPublicRoute = publicAuth.routes.public.some((route) => {
    return route === to.path || (route !== "/" && to.path.startsWith(route));
  });
  const isAuthPage = publicAuth.routes.authPages.some((route) => {
    return route === to.path || (route !== "/" && to.path.startsWith(route));
  });

  if (import.meta.server) {
    await auth.serverReady.value;
  }

  if (import.meta.client && !auth.ready.value) {
    await auth.fetchUser();
  }

  // A profile fetch, login, or refresh can temporarily set status to loading.
  // Do not interpret that transitional state as an anonymous user and redirect.
  if (auth.loading.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(auth.status, (status) => {
        if (status !== "loading") {
          stop();
          resolve();
        }
      });
    });
  }

  if (auth.isAuthenticated.value && isAuthPage) {
    const redirectPath =
      typeof to.query.redirect === "string"
        ? to.query.redirect
        : publicAuth.redirects.authenticated;

    return navigateTo(redirectPath);
  }

  if (!auth.isAuthenticated.value && !isPublicRoute) {
    return navigateTo({
      path: publicAuth.redirects.login,
      query: { redirect: to.fullPath },
    });
  }

  // SSR could not reach Redis, so authentication is unknown rather than
  // confirmed absent. Avoid converting an infrastructure outage into a
  // misleading login redirect; protected server APIs still enforce auth.
  if (auth.status.value === "unavailable") return;

  const requirement = to.meta.authorization as
    | AuthorizationRouteRequirement
    | undefined;

  // Authorization enforcement only applies when the authorization subsystem is
  // enabled and the route opted in via metadata. Authentication failures are
  // handled above; this block only distinguishes authorized vs unauthorized
  // for already-authenticated users.
  if (
    publicAuth.authorizationEnabled &&
    auth.isAuthenticated.value &&
    requirement?.abilities &&
    !hasRequiredAbilities(auth.abilities.value, requirement)
  ) {
    return navigateTo(publicAuth.redirects.unauthorized);
  }
});
