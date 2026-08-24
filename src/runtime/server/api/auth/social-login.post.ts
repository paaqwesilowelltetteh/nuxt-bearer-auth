import { createError, defineEventHandler, readBody } from "h3";
import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { toPublicError } from "../../utils/errors";
import { normalizeAuthResponse } from "../../utils/normalize";
import { createBearerAuthSession } from "../../utils/sessions";
import { extractAuthorizationFromResponse } from "../../utils/authorization";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);

    if (!body.jwt && !body.token && !body.accessToken) {
      throw createError({
        statusCode: 422,
        statusMessage: "Provider token is required",
      });
    }

    const response = await callAuthApi(getAuthEndpoint("socialLogin"), {
      event,
      method: "POST",
      body,
    });
    const auth = normalizeAuthResponse(response);
    const abilities = extractAuthorizationFromResponse(response);

    if (!auth.token || !auth.userId) {
      throw createError({
        statusCode: 401,
        statusMessage: auth.message || "Social login failed",
      });
    }

    await createBearerAuthSession(event, {
      userId: auth.userId,
      token: auth.token,
      refreshToken: auth.refreshToken,
      profile: auth.user,
      abilities,
    });

    return {
      success: true,
      user: auth.user,
      ...(abilities ? { abilities } : {}),
      message: auth.message || "Login successful",
    };
  } catch (error) {
    toPublicError(error, "Social login failed");
  }
});
