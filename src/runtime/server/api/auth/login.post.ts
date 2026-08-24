import { createError, defineEventHandler, readBody } from "h3";
import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { toPublicError } from "../../utils/errors";
import {
  normalizeAuthResponse,
  requiresTwoFactor,
  requiresVerification,
} from "../../utils/normalize";
import { createBearerAuthSession } from "../../utils/sessions";
import { extractAuthorizationFromResponse } from "../../utils/authorization";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);

    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      throw createError({
        statusCode: 422,
        statusMessage: "Login credentials are required",
      });
    }

    // Flexible identifier detection: email, username, phone, mobile, identifier, or any non-password credential field
    const hasCustomIdentifier = Object.keys(body).some(
      (key) =>
        key !== "password" &&
        key !== "pass" &&
        key !== "remember" &&
        key !== "rememberMe" &&
        Boolean(body[key]),
    );

    const identifier =
      body.identifier ??
      body.email ??
      body.username ??
      body.phone ??
      body.mobile ??
      body.phone_number ??
      (hasCustomIdentifier ? true : undefined);

    const password = body.password ?? body.pass;

    if (!identifier && !password) {
      throw createError({
        statusCode: 422,
        statusMessage:
          "Login credentials are required. Provide an identifier (e.g. email, username, phone, mobile, or identifier) and a password.",
      });
    }

    if (!identifier) {
      throw createError({
        statusCode: 422,
        statusMessage:
          "Login identifier is required (e.g. email, username, phone, mobile, or identifier).",
      });
    }

    if (!password) {
      throw createError({
        statusCode: 422,
        statusMessage: "Password is required.",
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
      abilities: extractAuthorizationFromResponse(response),
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
