import { defineEventHandler, readBody } from "h3";
import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { toPublicError } from "../../utils/errors";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);
    const response = await callAuthApi(getAuthEndpoint("resetPassword"), {
      event,
      method: "POST",
      body,
    });

    return response;
  } catch (error) {
    toPublicError(error, "Reset password request failed");
  }
});
