import { defineEventHandler, getRouterParam, readBody } from "h3";
import { callAuthApi, getAuthEndpoint } from "../../../utils/external-api";
import { toPublicError } from "../../../utils/errors";
import { interpolatePath } from "../../../utils/paths";

export default defineEventHandler(async (event) => {
  try {
    const identifier = getRouterParam(event, "identifier");
    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}));
    const endpoint = interpolatePath(getAuthEndpoint("resendOtp"), {
      identifier,
    });

    const response = await callAuthApi(endpoint, {
      event,
      method: "POST",
      body,
    });

    return response;
  } catch (error) {
    toPublicError(error, "Resending OTP failed");
  }
});
