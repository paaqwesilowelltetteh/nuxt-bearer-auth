import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from "#app";
import { useBearerAuth } from "../composables/useBearerAuth";

export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig();
  const publicAuth = config.public.bearerAuth as {
    redirects: {
      login: string;
      authenticated: string;
    };
    routes: {
      public: string[];
      authPages: string[];
    };
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
});
