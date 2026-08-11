import {
  getUserBearerAuthSessions,
  requireBearerAuthSession,
} from "../../utils/sessions";
import { defineEventHandler } from "h3";

export default defineEventHandler(async (event) => {
  const session = requireBearerAuthSession(event);

  return {
    sessions: await getUserBearerAuthSessions(session.userId),
  };
});
