import { getBearerAuthConfig } from "./config";
import { readFirstPath } from "./paths";
import type { BearerAuthUser } from "../../types/auth";

export interface NormalizedAuthResponse {
  raw: unknown;
  token?: string;
  refreshToken?: string;
  user?: BearerAuthUser;
  userId?: string;
  message?: string;
  success: boolean;
  code?: string | number;
  nextAction?: string;
}

export function normalizeAuthResponse(response: unknown): NormalizedAuthResponse {
  const { responsePaths } = getBearerAuthConfig();
  const user = readFirstPath<BearerAuthUser>(response, responsePaths.user);
  const userId = user
    ? readFirstPath<string | number>(user, responsePaths.userId)
    : undefined;
  const successValue = readFirstPath<boolean | string>(
    response,
    responsePaths.success,
  );

  return {
    raw: response,
    token: readFirstPath<string>(response, responsePaths.token),
    refreshToken: readFirstPath<string>(response, responsePaths.refreshToken),
    user,
    userId: userId === undefined ? undefined : String(userId),
    message: readFirstPath<string>(response, responsePaths.message),
    success:
      successValue === undefined ||
      successValue === true ||
      successValue === "success" ||
      successValue === "ok",
    code: readFirstPath<string | number>(response, responsePaths.code),
    nextAction: readFirstPath<string>(response, responsePaths.nextAction),
  };
}

export function requiresVerification(nextAction?: string) {
  if (!nextAction) return false;
  return getBearerAuthConfig().verificationRequiredActions.includes(nextAction);
}

export function requiresTwoFactor(nextAction?: string) {
  if (!nextAction) return false;
  return getBearerAuthConfig().twoFactorRequiredActions.includes(nextAction);
}
