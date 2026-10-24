import { createError, defineEventHandler, getRequestURL } from "h3";
import { useRuntimeConfig } from "#imports";
import { getBearerAuthSession } from "../utils/sessions";
import { getBearerAuthConfig } from "../utils/config";
import type { AuthorizationState } from "../../types/auth";
import type { BearerAuthRouteOptions } from "../../../types";

function matchesPathPrefix(path: string, prefix: string, strict: boolean) {
  if (!strict) return path.startsWith(prefix);
  return path === prefix || path.startsWith(`${prefix}/`);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const bearerAuthConfig = getBearerAuthConfig();
  const publicConfig = config.public.bearerAuth as {
    routes: BearerAuthRouteOptions;
  };

  const path = getRequestURL(event).pathname;
  const method = event.method.toUpperCase();
  const strictPrefixMatching =
    publicConfig.routes.strictPrefixMatching === true;
  const isProtectedApi = publicConfig.routes.protectedApiPrefixes.some(
    (prefix) => matchesPathPrefix(path, prefix, strictPrefixMatching),
  );
  const isPublicApi = publicConfig.routes.publicApiPrefixes.some((prefix) =>
    matchesPathPrefix(path, prefix, strictPrefixMatching),
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
