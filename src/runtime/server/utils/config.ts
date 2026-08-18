import type {
  BearerAuthCookieOptions,
  BearerAuthEndpointOptions,
  BearerAuthResponsePaths,
} from "../../../types";
import { createError } from "h3";
import { useRuntimeConfig } from "nitropack/runtime/config";

export interface RuntimeBearerAuthConfig {
  apiBaseUrl: string;
  redisUrl: string;
  appEnv: string;
  endpoints: BearerAuthEndpointOptions;
  responsePaths: BearerAuthResponsePaths;
  sessionCookie: BearerAuthCookieOptions;
  verificationRequiredActions: string[];
  twoFactorRequiredActions: string[];
}

export function getBearerAuthConfig(): RuntimeBearerAuthConfig {
  const config = useRuntimeConfig();
  return config.bearerAuth as unknown as RuntimeBearerAuthConfig;
}

export function requireApiBaseUrl() {
  const config = getBearerAuthConfig();

  if (!config.apiBaseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage:
        "bearerAuth.apiBaseUrl is required to proxy authentication requests.",
    });
  }

  return config.apiBaseUrl;
}

export function getSessionCookieName() {
  const config = getBearerAuthConfig();
  const isDev =
    config.appEnv === "local" ||
    config.appEnv === "development" ||
    process.env.NODE_ENV !== "production";

  return isDev
    ? config.sessionCookie.devName || config.sessionCookie.name
    : config.sessionCookie.name;
}

export function isProductionRuntime() {
  const config = getBearerAuthConfig();
  return config.appEnv === "production" || process.env.NODE_ENV === "production";
}
