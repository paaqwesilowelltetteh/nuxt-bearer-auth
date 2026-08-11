import { createError, defineEventHandler, getQuery } from "h3";
import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { toPublicError } from "../../utils/errors";
import { normalizeAuthResponse } from "../../utils/normalize";
import {
  requireBearerAuthSession,
  updateBearerAuthSession,
} from "../../utils/sessions";

export default defineEventHandler(async (event) => {
  const session = requireBearerAuthSession(event);
  const query = getQuery(event);
  const forceRefresh = query.refresh === "true" || query.refresh === "1";

  if (!forceRefresh && session.profile) {
    return {
      user: session.profile,
    };
  }

  try {
    const response = await callAuthApi(getAuthEndpoint("me"), {
      event,
      method: "GET",
    });
    const auth = normalizeAuthResponse(response);

    if (!auth.user) {
      throw createError({
        statusCode: 401,
        statusMessage: auth.message || "User unauthenticated",
      });
    }

    await updateBearerAuthSession(event, { profile: auth.user });

    return {
      user: auth.user,
    };
  } catch (error) {
    toPublicError(error, "Fetching authenticated user failed");
  }
});
