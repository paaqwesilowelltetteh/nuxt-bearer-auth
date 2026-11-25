import { createError, defineEventHandler, setResponseHeader } from "h3";
import { validateBearerAuthSession } from "../../utils/sessions";

export default defineEventHandler(async (event) => {
  // A liveness response must never be cached by a browser, proxy, or CDN.
  setResponseHeader(event, "Cache-Control", "private, no-store, max-age=0");

  // Redis/storage errors intentionally propagate as infrastructure errors.
  // Only a missing, revoked, malformed, or expired session becomes 401.
  const valid = await validateBearerAuthSession(event);

  if (!valid) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthenticated",
    });
  }

  // No identifiers or session material are returned to the browser.
  return { valid: true as const };
});
