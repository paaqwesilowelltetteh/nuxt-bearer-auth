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
    auth.clearAuthState();
    nuxtApp.payload.bearerAuth = {
      user: null,
      status: "unauthenticated",
      abilities: null,
    };
  } finally {
    auth.setAuthReady(true);
    auth.setServerChecked();
  }
});
