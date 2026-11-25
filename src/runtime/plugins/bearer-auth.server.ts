import { defineNuxtPlugin } from "#app";
import { getBearerAuthSession } from "../server/utils/sessions";
import { useBearerAuth } from "../composables/useBearerAuth";

export default defineNuxtPlugin(async (nuxtApp) => {
  if (import.meta.client) return;

  const event = nuxtApp.ssrContext?.event;
  if (!event) return;

  const auth = useBearerAuth();

  try {
    const session = await getBearerAuthSession(event);
    auth.setUser(session?.profile || null);
    auth.setAbilities(session?.abilities || null);

    nuxtApp.payload.bearerAuth = {
      user: session?.profile || null,
      status: session?.profile ? "authenticated" : "unauthenticated",
      abilities: session?.abilities || null,
    };
  } catch (error) {
    console.error("[nuxt-bearer-auth] SSR auth hydration failed:", error);
    // A Redis/network failure cannot establish that the session is invalid.
    // Keep the state explicitly unavailable so route middleware does not
    // redirect the user to login as though their session had expired.
    auth.setAuthUnavailable();
    nuxtApp.payload.bearerAuth = {
      user: null,
      status: "unavailable",
      abilities: null,
    };
  } finally {
    auth.setAuthReady(true);
    auth.setServerChecked();
  }
});
