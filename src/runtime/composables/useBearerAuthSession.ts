import {
  useRouter,
  useRuntimeConfig,
  useState,
} from "#app";
import {
  computed,
  onMounted,
  onScopeDispose,
  ref,
  watch,
} from "vue";
import { $fetch } from "ofetch";
import { useBearerAuth } from "./useBearerAuth";
import {
  broadcastBearerAuthSessionInvalidation,
  listenForBearerAuthSessionInvalidation,
} from "../utils/session-sync";
import type {
  BearerAuthSessionValidity,
  BearerAuthSessionValidationResult,
  UseBearerAuthSessionOptions,
  BearerAuthSessionLivenessConfig,
} from "../../types";

let validationPromise: Promise<BearerAuthSessionValidationResult> | null = null;
let lastValidationAt = 0;

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as {
    statusCode?: number;
    status?: number;
    response?: { status?: number };
    data?: { statusCode?: number };
  };
  return (
    value.statusCode ??
    value.status ??
    value.response?.status ??
    value.data?.statusCode
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unable to verify the authentication session.";
}

export function useBearerAuthSession(
  options: UseBearerAuthSessionOptions = {},
) {
  const auth = useBearerAuth();
  const runtimeConfig = useRuntimeConfig();
  const publicAuth = runtimeConfig.public.bearerAuth as {
    routes: { localApiPrefix: string };
    sessionLiveness?: Partial<BearerAuthSessionLivenessConfig>;
  };
  const defaults = publicAuth.sessionLiveness || {};
  const settings = {
    enabled: false,
    intervalMs: 5 * 60 * 1000,
    minIntervalMs: 30 * 1000,
    validateOnMount: true,
    validateOnFocus: true,
    validateOnVisibilityChange: true,
    validateOnNavigation: false,
    onlyWhenVisible: true,
    crossTab: true,
    channelName: "nuxt-bearer-auth",
    ...defaults,
    ...options,
  };
  const apiPrefix = publicAuth.routes.localApiPrefix || "/api/auth";

  const validity = useState<BearerAuthSessionValidity>(
    "bearer-auth-session-validity",
    () => "unknown",
  );
  const checkedAt = useState<number | null>(
    "bearer-auth-session-checked-at",
    () => null,
  );
  const validationError = useState<string | null>(
    "bearer-auth-session-error",
    () => null,
  );
  const validating = ref(false);
  const isValid = computed(() => validity.value === "valid");

  function handleInvalidation() {
    // Multiple mounted composable instances share Nuxt state; process a given
    // invalidation once so consumer callbacks are not duplicated.
    if (validity.value === "invalid") return;
    validity.value = "invalid";
    checkedAt.value = Date.now();
    validationError.value = null;
    auth.clearAuthState();
    try {
      options.onSessionInvalidated?.();
    } catch {
      // Consumer callbacks must not interfere with auth-state invalidation.
    }
  }

  async function validate(
    validationOptions: { force?: boolean } = {},
  ): Promise<BearerAuthSessionValidationResult> {
    if (import.meta.server) return "skipped";
    if (!auth.ready.value || !auth.isAuthenticated.value) return "skipped";

    if (validationPromise) return validationPromise;

    const now = Date.now();
    if (
      !validationOptions.force &&
      lastValidationAt > 0 &&
      now - lastValidationAt < Math.max(0, settings.minIntervalMs)
    ) {
      return validity.value === "valid" ||
        validity.value === "invalid" ||
        validity.value === "unavailable"
        ? validity.value
        : "skipped";
    }

    lastValidationAt = now;
    const generationAtStart = authGeneration;
    const currentPromise = (async () => {
      validating.value = true;
      try {
        await $fetch<{ valid: true }>(`${apiPrefix}/session`, {
          method: "GET",
          retry: 0,
          cache: "no-store",
        });
        if (
          generationAtStart !== authGeneration ||
          !auth.isAuthenticated.value
        ) {
          return validity.value === "invalid" ? "invalid" : "skipped";
        }
        validity.value = "valid";
        checkedAt.value = Date.now();
        validationError.value = null;
        return "valid" as const;
      } catch (error) {
        if (
          generationAtStart !== authGeneration ||
          !auth.isAuthenticated.value
        ) {
          return validity.value === "invalid" ? "invalid" : "skipped";
        }
        if (getStatusCode(error) === 401) {
          validity.value = "invalid";
          checkedAt.value = Date.now();
          validationError.value = null;
          auth.clearAuthState();
          if (settings.crossTab) {
            broadcastBearerAuthSessionInvalidation(settings.channelName);
          }
          try {
            options.onSessionInvalidated?.();
          } catch {
            // A consumer callback cannot undo confirmed invalidation.
          }
          return "invalid" as const;
        }

        validity.value = "unavailable";
        checkedAt.value = Date.now();
        validationError.value = getErrorMessage(error);
        try {
          options.onValidationError?.(error);
        } catch {
          // Ignore callback failures; preserve the unavailable state.
        }
        return "unavailable" as const;
      } finally {
        validating.value = false;
      }
    })();

    validationPromise = currentPromise;
    try {
      return await currentPromise;
    } finally {
      if (validationPromise === currentPromise) {
        validationPromise = null;
      }
    }
  }

  let authGeneration = 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopNavigationGuard: (() => void) | undefined;
  let stopCrossTab: (() => void) | undefined;
  let onFocus: (() => void) | undefined;
  let onVisibilityChange: (() => void) | undefined;
  const router = settings.validateOnNavigation ? useRouter() : undefined;

  function canRunAutomaticCheck() {
    return (
      auth.ready.value &&
      auth.isAuthenticated.value &&
      (!settings.onlyWhenVisible ||
        typeof document === "undefined" ||
        document.visibilityState === "visible")
    );
  }

  function validateAutomatically() {
    if (settings.enabled && canRunAutomaticCheck()) {
      void validate();
    }
  }

  watch(
    auth.status,
    (status, previousStatus) => {
      authGeneration += 1;
      if (status === "authenticated" && previousStatus !== "authenticated") {
        validity.value = "unknown";
        checkedAt.value = null;
        validationError.value = null;
      } else if (status !== "authenticated" && validity.value !== "invalid") {
        // Loading and ordinary local logout are not proof of expiry.
        validity.value = "unknown";
        checkedAt.value = null;
        validationError.value = null;
      }
    },
  );

  onMounted(() => {
    if (settings.crossTab) {
      stopCrossTab = listenForBearerAuthSessionInvalidation(
        settings.channelName,
        handleInvalidation,
      );
    }

    if (!settings.enabled) return;

    if (settings.validateOnMount) validateAutomatically();

    onFocus = () => {
      if (settings.validateOnFocus) validateAutomatically();
    };
    onVisibilityChange = () => {
      if (
        settings.validateOnVisibilityChange &&
        document.visibilityState === "visible"
      ) {
        validateAutomatically();
      }
    };

    if (settings.validateOnFocus) {
      window.addEventListener("focus", onFocus);
    }
    if (settings.validateOnVisibilityChange) {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    if (settings.intervalMs > 0) {
      interval = setInterval(validateAutomatically, settings.intervalMs);
    }

    if (settings.validateOnNavigation && router) {
      stopNavigationGuard = router.afterEach(() => {
        validateAutomatically();
      });
    }
  });

  onScopeDispose(() => {
    if (interval) clearInterval(interval);
    stopNavigationGuard?.();
    stopCrossTab?.();
    if (onFocus) window.removeEventListener("focus", onFocus);
    if (onVisibilityChange) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  });

  return {
    validity,
    isValid,
    checkedAt,
    error: validationError,
    validating,
    validate,
  };
}
