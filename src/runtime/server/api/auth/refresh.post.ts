import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { toPublicError } from "../../utils/errors";
import { normalizeAuthResponse } from "../../utils/normalize";
import {
  requireBearerAuthSession,
  updateBearerAuthSession,
} from "../../utils/sessions";
import { extractAuthorizationFromResponse } from "../../utils/authorization";
import { createError, defineEventHandler } from "h3";

export default defineEventHandler(async (event) => {
  const session = requireBearerAuthSession(event);

  try {
    const response = await callAuthApi(getAuthEndpoint("refresh"), {
      event,
      method: "POST",
      body: session.refreshToken
        ? {
            refresh_token: session.refreshToken,
            refreshToken: session.refreshToken,
          }
        : {},
    });
    const auth = normalizeAuthResponse(response);

    if (!auth.token) {
      throw createError({
        statusCode: 401,
        statusMessage: auth.message || "Token refresh failed",
      });
    }

    // Extract authorization if present in response (optional)
    const abilities = extractAuthorizationFromResponse(response);

    await updateBearerAuthSession(event, {
      token: auth.token,
      refreshToken: auth.refreshToken || session.refreshToken,
      profile: auth.user || session.profile,
      abilities: abilities ?? session.abilities,
    });

    return {
      success: true,
      user: auth.user || session.profile,
      ...(abilities ? { abilities } : {}),
      message: auth.message || "Session refreshed",
    };
  } catch (error) {
    toPublicError(error, "Refreshing session failed");
  }
});
