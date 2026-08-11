import type { BearerAuthSession } from "./auth";

declare module "h3" {
  interface H3EventContext {
    auth?: BearerAuthSession | null;
  }
}
