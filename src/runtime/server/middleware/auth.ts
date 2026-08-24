import { createError, defineEventHandler, getRequestURL } from "h3";
import { useRuntimeConfig } from "#imports";
import { getBearerAuthSession } from "../utils/sessions";
import { getBearerAuthConfig } from "../utils/config";
import type { AuthorizationState } from "../../types/auth";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const bearerAuthConfig = getBearerAuthConfig();
  const publicConfig = config.public.bearerAuth as {
    routes: {
      protectedApiPrefixes: string[];
      publicApiPrefixes: string[];
    };
  };

  const path = getRequestURL(event).pathname;
  const method = event.method.toUpperCase();
  const isProtectedApi = publicConfig.routes.protectedApiPrefixes.some(
    (prefix) => path.startsWith(prefix),
  );
  const isPublicApi = publicConfig.routes.publicApiPrefixes.some((prefix) =>
    path.startsWith(prefix),
  );

  if (isPublicApi || (!isProtectedApi && SAFE_METHODS.has(method))) {
    return;
  }

  const session = await getBearerAuthSession(event);

  if (session) {
    event.context.auth = session;

    // Set authorization state if authorization is enabled and abilities exist
    if (bearerAuthConfig.authorization?.enabled && session.abilities?.length) {
      const authorizationState: AuthorizationState = {
        abilities: session.abilities,
        source: "session",
      };
      event.context.authorization = authorizationState;
    }

    return;
  }

  if (isProtectedApi) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }
});
