import {
  addComponentsDir,
  addImports,
  addPlugin,
  addRouteMiddleware,
  addServerHandler,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  installModule,
} from "@nuxt/kit";
import { defu } from "defu";
import type {
  BearerAuthModuleOptions,
  BearerAuthPrivateRuntimeConfig,
  BearerAuthPublicRuntimeConfig,
} from "./types";

const defaultOptions = {
  apiBaseUrl: "",
  redisUrl: "redis://127.0.0.1:6379",
  sessionSecret: "",
  appEnv: process.env.APP_ENV || process.env.NODE_ENV || "development",
  installCsurf: true,
  endpoints: {
    login: "auth/login",
    socialLogin: "auth/social-login",
    logout: "auth/logout",
    me: "auth/account/me",
    refresh: "auth/refresh",
    forgotPassword: "auth/forgot-password",
    resetPassword: "auth/reset-password",
    verifyOtp: "auth/verify-otp",
    resendOtp: "auth/resend-otp/:identifier",
    register: "auth/register",
  },
  responsePaths: {
    token: ["data.token", "token", "access_token", "data.access_token"],
    refreshToken: [
      "data.refreshToken",
      "data.refresh_token",
      "refreshToken",
      "refresh_token",
    ],
    user: ["data.user", "user", "data", "$"],
    userId: ["id", "uuid", "data.id", "data.uuid"],
    message: ["message", "data.message"],
    success: ["success", "status"],
    code: ["code", "data.code"],
    nextAction: ["next_action", "data.next_action", "nextAction"],
  },
  redirects: {
    login: "/login",
    authenticated: "/dashboard",
    logout: "/",
    unauthorized: "/auth/not-allowed",
  },
  routes: {
    localApiPrefix: "/api/auth",
    public: ["/", "/login", "/forgot-password", "/reset-password"],
    authPages: ["/login", "/forgot-password", "/reset-password"],
    protectedApiPrefixes: ["/api"],
    publicApiPrefixes: [
      "/api/auth/login",
      "/api/auth/social-login",
      "/api/auth/register",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/otp-verification",
      "/api/auth/resend-otp",
      "/api/_csrf",
      "/_nuxt",
      "/__nuxt",
      "/_ipx",
      "/favicon.ico",
    ],
    middleware: true,
  },
  sessionCookie: {
    name: "nuxt_bearer_auth_session",
    devName: "nuxt_bearer_auth_session_dev",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    secure: undefined,
    path: "/",
  },
  csrf: {
    enabled: true,
    https: false,
    cookieKey: "nuxt_bearer_auth_csrf",
    devCookieKey: "nuxt_bearer_auth_csrf_dev",
    headerName: "x-csrf-token",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    methodsToProtect: ["POST", "PUT", "PATCH", "DELETE"],
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
    },
  },
  authorization: {
    enabled: false,
    source: "session",
    endpoint: "",
    responsePaths: {
      roles: ["roles", "data.roles"],
      permissions: ["permissions", "data.permissions"],
      abilities: ["abilities", "data.abilities"],
    },
    rolePrefix: "role:",
  },
  verificationRequiredActions: ["verify_account", "verification_required"],
  twoFactorRequiredActions: ["two_factor_required", "2fa_required"],
} satisfies Required<BearerAuthModuleOptions>;

const module = defineNuxtModule<BearerAuthModuleOptions>({
  meta: {
    name: "nuxt-bearer-auth",
    configKey: "bearerAuth",
    compatibility: {
      nuxt: "^3.12.0 || ^4.0.0",
    },
  },
  defaults: defaultOptions,
  async setup(moduleOptions, nuxt) {
    const resolver = createResolver(import.meta.url);
    const options = defu(moduleOptions, defaultOptions);

    nuxt.options.runtimeConfig.bearerAuth = defu<
      BearerAuthPrivateRuntimeConfig,
      [BearerAuthPrivateRuntimeConfig]
    >(
      nuxt.options.runtimeConfig.bearerAuth,
      {
        apiBaseUrl: options.apiBaseUrl,
        redisUrl: options.redisUrl,
        sessionSecret: options.sessionSecret,
        appEnv: options.appEnv,
        endpoints: options.endpoints,
        responsePaths: options.responsePaths,
        sessionCookie: options.sessionCookie,
        authorization: options.authorization,
        verificationRequiredActions: options.verificationRequiredActions,
        twoFactorRequiredActions: options.twoFactorRequiredActions,
      },
    );

    nuxt.options.runtimeConfig.public.bearerAuth = defu<
      BearerAuthPublicRuntimeConfig,
      [BearerAuthPublicRuntimeConfig]
    >(
      nuxt.options.runtimeConfig.public.bearerAuth,
      {
        redirects: options.redirects,
        routes: options.routes,
        // Serializable derived flag so the global middleware knows whether the
        // authorization subsystem is active. Never put functions here.
        authorizationEnabled: options.authorization?.enabled ?? false,
      },
    );

    if (options.installCsurf && options.csrf?.enabled) {
      await installModule("nuxt-csurf", {
        https: options.csrf.https,
        cookieKey:
          options.appEnv === "local" || options.appEnv === "development"
            ? options.csrf.devCookieKey
            : options.csrf.cookieKey,
        cookie: options.csrf.cookie,
        methods: options.csrf.methods,
        methodsToProtect: options.csrf.methodsToProtect,
        encryptAlgorithm: "aes-256-cbc",
        addCsrfTokenToEventCtx: true,
        headerName: options.csrf.headerName,
      });

      // Automatically disable CSRF enforcement on public auth endpoints.
      // These routes are pre-authentication so they have no session to protect,
      // and the authFetch in useBearerAuth sends the token via $csrfFetch already —
      // but this guards against any edge case (e.g. client-side nav with no SSR meta tag).
      const prefix = options.routes?.localApiPrefix || "/api/auth";
      nuxt.options.routeRules = {
        ...nuxt.options.routeRules,
        [`${prefix}/login`]: {
          csurf: false,
          ...nuxt.options.routeRules?.[`${prefix}/login`],
        },
        [`${prefix}/register`]: {
          csurf: false,
          ...nuxt.options.routeRules?.[`${prefix}/register`],
        },
        [`${prefix}/social-login`]: {
          csurf: false,
          ...nuxt.options.routeRules?.[`${prefix}/social-login`],
        },
        [`${prefix}/forgot-password`]: {
          csurf: false,
          ...nuxt.options.routeRules?.[`${prefix}/forgot-password`],
        },
        [`${prefix}/reset-password`]: {
          csurf: false,
          ...nuxt.options.routeRules?.[`${prefix}/reset-password`],
        },
        [`${prefix}/otp-verification`]: {
          csurf: false,
          ...nuxt.options.routeRules?.[`${prefix}/otp-verification`],
        },
        [`${prefix}/resend-otp/**`]: {
          csurf: false,
          ...nuxt.options.routeRules?.[`${prefix}/resend-otp/**`],
        },
        "/api/_csrf": {
          csurf: false,
          ...nuxt.options.routeRules?.["/api/_csrf"],
        },
      };
    }

    addImports([
      {
        name: "useBearerAuth",
        from: resolver.resolve("runtime/composables/useBearerAuth"),
      },
      {
        name: "useBearerAuth",
        as: "useAuth",
        from: resolver.resolve("runtime/composables/useBearerAuth"),
      },
    ]);

    addPlugin(resolver.resolve("runtime/plugins/bearer-auth.server"));

    // Phase 4 UI authorization primitives. Auto-imported as <Can>/<Cannot>
    // (app-level components of the same name take precedence). Rendering is
    // advisory only; these components never authorize API requests.
    addComponentsDir({
      path: resolver.resolve("runtime/components"),
    });

    if (options.routes?.middleware !== false) {
      addRouteMiddleware({
        name: "bearer-auth",
        path: resolver.resolve("runtime/middleware/bearer-auth.global"),
        global: true,
      });
    }

    addServerPlugin(resolver.resolve("runtime/server/plugins/redis"));
    addServerHandler({
      middleware: true,
      handler: resolver.resolve("runtime/server/middleware/auth"),
    });

    const prefix = options.routes?.localApiPrefix || "/api/auth";
    addServerHandler({
      route: `${prefix}/login`,
      method: "post",
      handler: resolver.resolve("runtime/server/api/auth/login.post"),
    });
    addServerHandler({
      route: `${prefix}/social-login`,
      method: "post",
      handler: resolver.resolve("runtime/server/api/auth/social-login.post"),
    });
    addServerHandler({
      route: `${prefix}/logout`,
      method: "post",
      handler: resolver.resolve("runtime/server/api/auth/logout.post"),
    });
    addServerHandler({
      route: `${prefix}/me`,
      method: "get",
      handler: resolver.resolve("runtime/server/api/auth/me.get"),
    });
    addServerHandler({
      route: `${prefix}/refresh`,
      method: "post",
      handler: resolver.resolve("runtime/server/api/auth/refresh.post"),
    });
    addServerHandler({
      route: `${prefix}/forgot-password`,
      method: "post",
      handler: resolver.resolve("runtime/server/api/auth/forgot-password.post"),
    });
    addServerHandler({
      route: `${prefix}/reset-password`,
      method: "post",
      handler: resolver.resolve("runtime/server/api/auth/reset-password.post"),
    });
    addServerHandler({
      route: `${prefix}/otp-verification`,
      method: "post",
      handler: resolver.resolve(
        "runtime/server/api/auth/otp-verification.post",
      ),
    });
    addServerHandler({
      route: `${prefix}/resend-otp/:identifier`,
      method: "post",
      handler: resolver.resolve(
        "runtime/server/api/auth/resend-otp/[identifier].post",
      ),
    });
    addServerHandler({
      route: `${prefix}/register`,
      method: "post",
      handler: resolver.resolve("runtime/server/api/auth/register.post"),
    });
    addServerHandler({
      route: `${prefix}/sessions`,
      method: "get",
      handler: resolver.resolve("runtime/server/api/auth/sessions.get"),
    });
    addServerHandler({
      route: `${prefix}/sessions/:id`,
      method: "delete",
      handler: resolver.resolve("runtime/server/api/auth/sessions/[id].delete"),
    });
  },
});

export type * from "./types";
export type * from "./runtime/types/auth";
export default module;
