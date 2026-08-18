import { createError, defineEventHandler, readBody } from "h3";
import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { toPublicError } from "../../utils/errors";
import { normalizeAuthResponse } from "../../utils/normalize";
import { createBearerAuthSession } from "../../utils/sessions";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);

    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      throw createError({
        statusCode: 422,
        statusMessage: "OTP verification credentials are required",
      });
    }

    const otp = body.otp ?? body.code;
    const identifier =
      body.identifier ??
      body.email ??
      body.phone ??
      body.mobile ??
      body.username ??
      body.phone_number;

    if (!otp && !identifier) {
      throw createError({
        statusCode: 422,
        statusMessage:
          "OTP code and identifier (e.g. email, phone, mobile, username, or identifier) are required.",
      });
    }

    if (!otp) {
      throw createError({
        statusCode: 422,
        statusMessage: "OTP code is required.",
      });
    }

    if (!identifier) {
      throw createError({
        statusCode: 422,
        statusMessage:
          "Identifier is required for OTP verification (e.g. email, phone, mobile, username, or identifier).",
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
