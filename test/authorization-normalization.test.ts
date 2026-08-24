import { describe, expect, it, vi } from "vitest";

vi.mock("../src/runtime/server/utils/config", () => ({
  getBearerAuthConfig: () => ({
    authorization: {
      enabled: true,
      source: "session",
      endpoint: "",
      responsePaths: {
        roles: ["roles", "data.roles"],
        permissions: ["permissions", "data.permissions"],
        abilities: ["abilities", "data.abilities"],
      },
      rolePrefix: "role:",
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
  }),
}));

import {
  normalizeAuthorizationData,
  extractAuthorizationFromResponse,
} from "../src/runtime/server/utils/authorization";

describe("authorization normalization", () => {
  describe("normalizeAuthorizationData", () => {
    it("normalizes direct abilities", () => {
      const response = {
        abilities: ["campaign.create", "campaign.view"],
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual(["campaign.create", "campaign.view"]);
    });

    it("normalizes roles with prefix", () => {
      const response = {
        roles: ["admin", "editor"],
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual(["role:admin", "role:editor"]);
    });

    it("normalizes permissions", () => {
      const response = {
        permissions: ["posts.view", "posts.create"],
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual(["posts.create", "posts.view"]);
    });

    it("normalizes mixed roles and permissions", () => {
      const response = {
        roles: ["admin"],
        permissions: ["posts.view", "posts.create"],
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual(["posts.create", "posts.view", "role:admin"]);
    });

    it("normalizes mixed roles, permissions, and abilities", () => {
      const response = {
        roles: ["editor"],
        permissions: ["posts.view"],
        abilities: ["special.action"],
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual(["posts.view", "role:editor", "special.action"]);
    });

    it("removes duplicate abilities", () => {
      const response = {
        abilities: ["campaign.view", "campaign.view"],
        roles: ["admin", "admin"],
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual(["campaign.view", "role:admin"]);
    });

    it("removes empty strings", () => {
      const response = {
        abilities: ["campaign.view", "", "campaign.create"],
        roles: ["", "admin"],
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual([
        "campaign.create",
        "campaign.view",
        "role:admin",
      ]);
    });

    it("handles null values gracefully", () => {
      const response = {
        abilities: null,
        roles: null,
        permissions: null,
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual([]);
    });

    it("handles undefined values gracefully", () => {
      const response = {
        abilities: undefined,
        roles: undefined,
        permissions: undefined,
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual([]);
    });

    it("handles missing fields gracefully", () => {
      const response = {};

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual([]);
    });

    it("supports nested response paths for abilities", () => {
      const response = {
        data: {
          abilities: ["campaign.create", "campaign.view"],
        },
      };

      const result = normalizeAuthorizationData(response, {
        responsePaths: {
          abilities: ["data.abilities"],
        },
      });

      expect(result).toEqual(["campaign.create", "campaign.view"]);
    });

    it("supports nested response paths for roles", () => {
      const response = {
        data: {
          roles: ["admin"],
        },
      };

      const result = normalizeAuthorizationData(response, {
        responsePaths: {
          roles: ["data.roles"],
        },
      });

      expect(result).toEqual(["role:admin"]);
    });

    it("supports custom role prefix", () => {
      const response = {
        roles: ["admin", "editor"],
      };

      const result = normalizeAuthorizationData(response, {
        rolePrefix: "perm:",
      });

      expect(result).toEqual(["perm:admin", "perm:editor"]);
    });

    it("ignores non-string values in arrays", () => {
      const response = {
        abilities: ["campaign.view", 123, null, undefined, "campaign.create"],
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual(["campaign.create", "campaign.view"]);
    });

    it("returns sorted result for deterministic ordering", () => {
      const response = {
        abilities: ["zebra", "apple", "middle"],
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual(["apple", "middle", "zebra"]);
    });

    it("handles Laravel Sanctum response format", () => {
      const response = {
        success: true,
        data: {
          token: "1|laravel_plain_token",
          user: {
            id: 42,
            name: "Enoch",
          },
          roles: ["admin"],
          permissions: ["posts.view", "posts.create"],
        },
      };

      const result = normalizeAuthorizationData(response, {
        responsePaths: {
          roles: ["data.roles"],
          permissions: ["data.permissions"],
        },
      });

      expect(result).toEqual(["posts.create", "posts.view", "role:admin"]);
    });
  });

  describe("extractAuthorizationFromResponse", () => {
    it("extracts authorization when enabled", () => {
      const response = {
        abilities: ["campaign.create"],
      };

      const result = extractAuthorizationFromResponse(response);

      expect(result).toEqual(["campaign.create"]);
    });

    it("returns null when no abilities found", () => {
      const response = {
        success: true,
      };

      const result = extractAuthorizationFromResponse(response);

      expect(result).toBeNull();
    });

    it("returns null for empty ability list", () => {
      const response = {
        abilities: [],
      };

      const result = extractAuthorizationFromResponse(response);

      expect(result).toBeNull();
    });

    it("extracts roles when enabled", () => {
      const response = {
        roles: ["admin", "editor"],
      };

      const result = extractAuthorizationFromResponse(response);

      expect(result).toEqual(["role:admin", "role:editor"]);
    });

    it("extracts permissions when enabled", () => {
      const response = {
        permissions: ["posts.view", "posts.create"],
      };

      const result = extractAuthorizationFromResponse(response);

      expect(result).toEqual(["posts.create", "posts.view"]);
    });

    it("handles normalization errors gracefully", () => {
      // If normalization somehow fails, should return null instead of throwing
      const response = {
        abilities: null,
        roles: null,
        permissions: null,
      };

      expect(() => {
        extractAuthorizationFromResponse(response);
      }).not.toThrow();
    });
  });

  describe("backwards compatibility", () => {
    it("handles responses without authorization fields", () => {
      const response = {
        success: true,
        data: {
          token: "token123",
          user: {
            id: 1,
            name: "Test User",
          },
        },
      };

      const result = normalizeAuthorizationData(response);

      expect(result).toEqual([]);
    });

    it("does not mutate original response object", () => {
      const response = {
        abilities: ["campaign.view"],
        roles: ["admin"],
        user: {
          id: 1,
          name: "Test",
        },
      };

      const originalAbilities = response.abilities;
      const originalRoles = response.roles;

      normalizeAuthorizationData(response);

      expect(response.abilities).toBe(originalAbilities);
      expect(response.roles).toBe(originalRoles);
    });
  });
});
