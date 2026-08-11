import { createError, defineEventHandler, readBody } from "h3";
import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { toPublicError } from "../../utils/errors";
import { normalizeAuthResponse } from "../../utils/normalize";
import { createBearerAuthSession } from "../../utils/sessions";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);

    if (!body.otp || !body.identifier) {
      throw createError({
        statusCode: 422,
        statusMessage: "OTP and identifier are required",
      });
    }

    const response = await callAuthApi(getAuthEndpoint("verifyOtp"), {
      event,
      method: "POST",
      body,
    });
    const auth = normalizeAuthResponse(response);

    if (auth.token && auth.userId) {
      await createBearerAuthSession(event, {
        userId: auth.userId,
        token: auth.token,
        refreshToken: auth.refreshToken,
        profile: auth.user,
      });
    }

    return {
      success: true,
      user: auth.user || null,
      message: auth.message || "OTP verified successfully",
      data: response,
    };
  } catch (error) {
    toPublicError(error, "OTP verification failed");
  }
});
