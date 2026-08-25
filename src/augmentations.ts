/**
 * Ambient type augmentations for @nuxt/schema.
 *
 * Placement notes for future maintainers:
 * - This intentionally lives in an included `.ts` file, NOT a `.d.ts`:
 *   ambient `.d.ts` files did not participate in declaration merging under
 *   this project's configuration, and `skipLibCheck` hides such mistakes
 *   silently.
 * - It is deliberately NOT imported by `module.ts`: importing it there would
 *   pull `nitropack/types` into the published declaration graph, which
 *   unbuild's dts rollup cannot parse.
 * - Importing members of "@nuxt/schema" below anchors the `declare module`
 *   block so it merges with the real module rather than forming a detached
 *   ambient module.
 */
import type { NitroRouteRules } from "nitropack/types";
import type {
  NuxtConfig as _NuxtConfig,
  NuxtOptions as _NuxtOptions,
  PublicRuntimeConfig as _PublicRuntimeConfig,
  RuntimeConfig as _RuntimeConfig,
} from "@nuxt/schema";
import type {
  BearerAuthModuleOptions,
  BearerAuthPrivateRuntimeConfig,
  BearerAuthPublicRuntimeConfig,
} from "./types";

declare module "@nuxt/schema" {
  interface NuxtConfig {
    bearerAuth?: BearerAuthModuleOptions;
  }

  interface NuxtOptions {
    bearerAuth?: BearerAuthModuleOptions;

    /**
     * `nuxt.options.routeRules` exists and works at runtime but is absent
     * from the @nuxt/schema ConfigSchema typings resolved here. Rule values
     * allow additional module-specific keys (for example `csurf`) alongside
     * Nitro's own route-rule properties.
     */
    routeRules?: Record<string, NitroRouteRules & Record<string, unknown>>;
  }

  interface RuntimeConfig {
    bearerAuth?: BearerAuthPrivateRuntimeConfig;
  }

  interface PublicRuntimeConfig {
    bearerAuth?: BearerAuthPublicRuntimeConfig;
  }
}