import type { AuthorizationState, BearerAuthSession } from "./auth";

declare module "h3" {
  interface H3EventContext {
    auth?: BearerAuthSession | null;
    authorization?: AuthorizationState;
  }
}
