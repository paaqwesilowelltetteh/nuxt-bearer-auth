import { getBearerAuthConfig } from "./config";
import { readFirstPath } from "./paths";
import type { AuthorizationResponsePaths } from "../../../types";

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
