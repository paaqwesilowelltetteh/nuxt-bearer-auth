import type { BearerAuthModuleOptions } from "./types";

declare module "@nuxt/schema" {
  interface NuxtConfig {
    bearerAuth?: BearerAuthModuleOptions;
  }

  interface NuxtOptions {
    bearerAuth?: BearerAuthModuleOptions;
  }
}

export {};
