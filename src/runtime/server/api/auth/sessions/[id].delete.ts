import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  deleteUserBearerAuthSession,
  requireBearerAuthSession,
} from "../../../utils/sessions";

export default defineEventHandler(async (event) => {
  const session = requireBearerAuthSession(event);
  const sessionId = getRouterParam(event, "id");

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Session ID is required",
    });
  }

  await deleteUserBearerAuthSession(session.userId, sessionId);

  return {
    success: true,
    message: "Session terminated",
  };
});
