import { createError, defineEventHandler, getRequestURL } from "h3";
import { useRuntimeConfig } from "#imports";
import { getBearerAuthSession } from "../utils/sessions";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const publicConfig = config.public.bearerAuth as {
    routes: {
      protectedApiPrefixes: string[];
      publicApiPrefixes: string[];
    };
  };

  const path = getRequestURL(event).pathname;
  const method = event.method.toUpperCase();
  const isProtectedApi = publicConfig.routes.protectedApiPrefixes.some((prefix) =>
    path.startsWith(prefix),
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
    return;
  }

  if (isProtectedApi) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }
});
