import { createError, defineEventHandler, readBody } from "h3";
import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { toPublicError } from "../../utils/errors";
import {
  normalizeAuthResponse,
  requiresTwoFactor,
  requiresVerification,
} from "../../utils/normalize";
import { createBearerAuthSession } from "../../utils/sessions";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);

    if (!body.identifier || !body.password) {
      throw createError({
        statusCode: 422,
        statusMessage: "Identifier and password are required",
      });
    }

    const response = await callAuthApi(getAuthEndpoint("login"), {
      event,
      method: "POST",
      body,
    });
    const auth = normalizeAuthResponse(response);

    if (
      requiresVerification(auth.nextAction) ||
      requiresTwoFactor(auth.nextAction)
    ) {
      return {
        success: true,
        code: auth.code,
        nextAction: auth.nextAction,
        user: auth.user || null,
        message: auth.message,
      };
    }

    if (!auth.token || !auth.userId) {
      throw createError({
        statusCode: 401,
        statusMessage: auth.message || "Authentication failed",
      });
    }

    await createBearerAuthSession(event, {
      userId: auth.userId,
      token: auth.token,
      refreshToken: auth.refreshToken,
      profile: auth.user,
    });

    return {
      success: true,
      user: auth.user,
      message: auth.message || "Login successful",
    };
  } catch (error) {
    toPublicError(error, "Login failed");
  }
});
