import { callAuthApi, getAuthEndpoint } from "../../utils/external-api";
import { destroyBearerAuthSession } from "../../utils/sessions";
import { defineEventHandler } from "h3";

export default defineEventHandler(async (event) => {
  try {
    await callAuthApi(getAuthEndpoint("logout"), {
      event,
      method: "POST",
      body: {},
    });
  } catch (error) {
    console.warn("[nuxt-bearer-auth] Remote logout failed:", error);
  } finally {
    await destroyBearerAuthSession(event);
  }

  return {
    success: true,
    message: "Logged out successfully",
  };
});
