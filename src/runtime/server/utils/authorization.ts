import { getBearerAuthConfig } from "./config";
import { readFirstPath } from "./paths";
import type { AuthorizationResponsePaths } from "../../../types";
import { createError, type H3Event } from "h3";
import { requireBearerAuthSession } from "./sessions";

const DEFAULT_AUTHORIZATION_CONFIG = {
  enabled: false,
  responsePaths: {
    roles: ["roles", "data.roles"],
    permissions: ["permissions", "data.permissions"],
    abilities: ["abilities", "data.abilities"],
  },
  rolePrefix: "role:",
};

/**
 * Normalizes authorization data from a backend response into a flat ability list.
 *
 * Supports normalization of:
 * - Direct abilities (string[])
 * - Roles (converted to "prefix:role" format)
 * - Permissions (string[])
 * - Mixed roles + permissions
 *
 * Handles missing, null, undefined, and empty values gracefully.
 * Removes duplicates and empty strings.
 */
export function normalizeAuthorizationData(
  response: unknown,
  config?: {
    responsePaths?: AuthorizationResponsePaths;
    rolePrefix?: string;
  },
): string[] {
  const authConfig = getBearerAuthConfig();
  const authorizationConfig = {
    ...DEFAULT_AUTHORIZATION_CONFIG,
    ...authConfig.authorization,
    responsePaths: {
      ...DEFAULT_AUTHORIZATION_CONFIG.responsePaths,
      ...authConfig.authorization?.responsePaths,
    },
  };
  const responsePaths =
    config?.responsePaths || authorizationConfig.responsePaths;
  const rolePrefix = config?.rolePrefix ?? authorizationConfig.rolePrefix;

  const abilities = new Set<string>();

  // Extract and normalize direct abilities
  if (responsePaths.abilities && responsePaths.abilities.length > 0) {
    const abilitiesValue = readFirstPath<unknown>(
      response,
      responsePaths.abilities,
    );
    if (Array.isArray(abilitiesValue)) {
      for (const ability of abilitiesValue) {
        if (typeof ability === "string" && ability.trim() !== "") {
          abilities.add(ability);
        }
      }
    }
  }

  // Extract and normalize roles
  if (responsePaths.roles && responsePaths.roles.length > 0) {
    const rolesValue = readFirstPath<unknown>(response, responsePaths.roles);
    if (Array.isArray(rolesValue)) {
      for (const role of rolesValue) {
        if (typeof role === "string" && role.trim() !== "") {
          abilities.add(`${rolePrefix}${role}`);
        }
      }
    }
  }

  // Extract and normalize permissions
  if (responsePaths.permissions && responsePaths.permissions.length > 0) {
    const permissionsValue = readFirstPath<unknown>(
      response,
      responsePaths.permissions,
    );
    if (Array.isArray(permissionsValue)) {
      for (const permission of permissionsValue) {
        if (typeof permission === "string" && permission.trim() !== "") {
          abilities.add(permission);
        }
      }
    }
  }

  // Return as sorted array for deterministic ordering
  return Array.from(abilities).sort();
}

/**
 * Extracts authorization information from a response if available.
 * Returns null if no authorization information is found or if authorization is disabled.
 */
export function extractAuthorizationFromResponse(
  response: unknown,
): string[] | null {
  const config = getBearerAuthConfig();

  if (!(config.authorization?.enabled ?? false)) {
    return null;
  }

  try {
    const abilities = normalizeAuthorizationData(response);
    return abilities.length > 0 ? abilities : null;
  } catch {
    // If normalization fails, return null rather than throwing
    return null;
  }
}

export function hasRequiredAbilities(
  abilities: string[] | null | undefined,
  required: string[],
  mode: "all" | "any" = "all",
) {
  if (required.length === 0) return true;
  // Fail closed: only a well-formed non-empty ability array can authorize.
  // Malformed session data (corrupted Redis payloads, wrong types) must never
  // grant access or crash into a 500 — it is treated as "no abilities".
  if (!Array.isArray(abilities) || abilities.length === 0) return false;

  return mode === "any"
    ? required.some((ability) => abilities.includes(ability))
    : required.every((ability) => abilities.includes(ability));
}

export function requireAbility(
  event: H3Event,
  required: string | string[],
  mode: "all" | "any" = "all",
) {
  const session = requireBearerAuthSession(event);
  const abilities = session.abilities;
  const requiredAbilities = Array.isArray(required) ? required : [required];

  if (!hasRequiredAbilities(abilities, requiredAbilities, mode)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Authorization required",
    });
  }

  event.context.authorization = {
    abilities: abilities || [],
    source: "session",
  };

  return session;
}
