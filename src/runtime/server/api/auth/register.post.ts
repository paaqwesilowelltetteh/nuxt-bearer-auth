import { defineEventHandler, readBody } from "h3";
import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { toPublicError } from "../../utils/errors";
import { normalizeAuthResponse } from "../../utils/normalize";
import { createBearerAuthSession } from "../../utils/sessions";
import { extractAuthorizationFromResponse } from "../../utils/authorization";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);
    const response = await callAuthApi(getAuthEndpoint("register"), {
      event,
      method: "POST",
      body,
    });
    const auth = normalizeAuthResponse(response);
    const abilities = extractAuthorizationFromResponse(response);

    if (auth.token && auth.userId) {
      await createBearerAuthSession(event, {
        userId: auth.userId,
        token: auth.token,
        refreshToken: auth.refreshToken,
        profile: auth.user,
        abilities,
      });
    }

    return {
      success: auth.success,
      user: auth.user || null,
      ...(abilities ? { abilities } : {}),
      message: auth.message || "Registration successful",
      data: response,
    };
  } catch (error) {
    toPublicError(error, "Registration failed");
  }
});
