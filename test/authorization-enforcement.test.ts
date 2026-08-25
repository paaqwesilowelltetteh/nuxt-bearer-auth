import { describe, expect, it, vi } from "vitest";

const mockRequireSession = vi.hoisted(() => vi.fn());

vi.mock("../src/runtime/server/utils/sessions", () => ({
  requireBearerAuthSession: mockRequireSession,
}));

vi.mock("../src/runtime/server/utils/config", () => ({
  getBearerAuthConfig: () => ({ authorization: { enabled: true } }),
}));

import {
  hasRequiredAbilities,
  requireAbility,
} from "../src/runtime/server/utils/authorization";

describe("authorization enforcement", () => {
  it("matches all required abilities by default", () => {
    expect(
      hasRequiredAbilities(
        ["users.view", "users.edit"],
        ["users.view", "users.edit"],
      ),
    ).toBe(true);
    expect(
      hasRequiredAbilities(["users.view"], ["users.view", "users.edit"]),
    ).toBe(false);
  });

  it("supports explicit any matching", () => {
    expect(
      hasRequiredAbilities(["users.view"], ["users.view", "users.edit"], "any"),
    ).toBe(true);
    expect(
      hasRequiredAbilities(
        ["reports.view"],
        ["users.view", "users.edit"],
        "any",
      ),
    ).toBe(false);
  });

  it("requires the trusted server session and sets separate authorization context", () => {
    const session = {
      userId: "u1",
      token: "server-token",
      refreshToken: "refresh-token",
      profile: { id: "u1" },
      abilities: ["users.delete"],
    };
    mockRequireSession.mockReturnValueOnce(session);
    const event = { context: { auth: session } } as any;

    expect(requireAbility(event, "users.delete")).toBe(session);
    expect(event.context.auth).toBe(session);
    expect(event.context.authorization).toEqual({
      abilities: ["users.delete"],
      source: "session",
    });
    expect(event.context.authorization).not.toHaveProperty("token");
    expect(event.context.authorization).not.toHaveProperty("refreshToken");
  });

  it("rejects an authenticated session without the required ability", () => {
    mockRequireSession.mockReturnValueOnce({
      userId: "u1",
      token: "server-token",
      profile: { id: "u1" },
      abilities: ["users.view"],
    });

    expect(() =>
      requireAbility({ context: {} } as any, "users.delete"),
    ).toThrow("Authorization required");
  });

  it("uses exact matching and does not accept client claims", () => {
    expect(hasRequiredAbilities(["users.view"], ["users.*"])).toBe(false);
    expect(hasRequiredAbilities(["users.view"], ["users.delete"])).toBe(false);
    // Prefix sharing is not hierarchical: "users.view.edit" ≠ "users.view".
    expect(hasRequiredAbilities(["users.view.edit"], ["users.view"])).toBe(
      false,
    );
    // A literal wildcard requirement demands that exact string.
    expect(hasRequiredAbilities(["users.view"], ["users.*"])).toBe(false);
    expect(hasRequiredAbilities(["users.*"], ["users.*"])).toBe(true);
  });

  it("propagates 401 when there is no authenticated session", async () => {
    const unauthorizedError = Object.assign(
      new Error("Unauthenticated"),
      { statusCode: 401 },
    );
    mockRequireSession.mockClear();
    mockRequireSession.mockImplementationOnce(() => {
      throw unauthorizedError;
    });

    try {
      await requireAbility({ context: {} } as any, "users.view");
      throw new Error("expected requireAbility to throw");
    } catch (error: any) {
      expect(error.statusCode).toBe(401);
      expect(error.message).not.toMatch(/token/i);
    }

    expect(mockRequireSession).toHaveBeenCalledTimes(1);
  });

  it("evaluates multiple abilities through requireAbility with all semantics", () => {
    const session = {
      userId: "u1",
      token: "server-token",
      profile: { id: "u1" },
      abilities: ["reports.view", "reports.export"],
    };
    mockRequireSession.mockReturnValueOnce(session);
    const event = { context: { auth: session } } as any;

    expect(() =>
      requireAbility(event, ["reports.view", "reports.export"]),
    ).not.toThrow();

    mockRequireSession.mockReturnValueOnce({
      ...session,
      abilities: ["reports.view"],
    });
    expect(() =>
      requireAbility({ context: {} } as any, [
        "reports.view",
        "reports.export",
      ]),
    ).toThrow("Authorization required");
  });

  it("supports any mode through requireAbility", () => {
    mockRequireSession.mockReturnValueOnce({
      userId: "u1",
      token: "server-token",
      profile: { id: "u1" },
      abilities: ["reports.export"],
    });
    const event = { context: { auth: null } } as any;

    expect(requireAbility(event, ["reports.view", "reports.export"], "any")).toBeTruthy();
  });

  it("never grants authorization from client-supplied state, headers, or query data", () => {
    const sessionWithoutAbilities = {
      userId: "u1",
      token: "server-token",
      profile: { id: "u1" },
      abilities: null,
    };
    mockRequireSession.mockReturnValueOnce(sessionWithoutAbilities);

    const event = {
      context: {
        auth: sessionWithoutAbilities,
        // Simulated client-controlled surfaces; requireAbility must ignore them.
        clientAbilities: ["users.delete"],
      },
      node: {
        req: {
          headers: { "x-abilities": "users.delete" },
          url: "/api/admin/users?ability=users.delete",
        },
      },
      query: { ability: "users.delete" },
    } as any;

    expect(() => requireAbility(event, "users.delete")).toThrow(
      "Authorization required",
    );
    expect(event.context.authorization).toBeUndefined();
  });

  it("fails closed on malformed session ability data instead of crashing", () => {
    const malformedStates: unknown[] = [
      "users.delete",
      { 0: "users.delete" },
      42,
      true,
      [null, undefined],
    ];

    for (const abilities of malformedStates) {
      mockRequireSession.mockReturnValueOnce({
        userId: "u1",
        token: "server-token",
        profile: { id: "u1" },
        abilities,
      });

      expect(() =>
        requireAbility({ context: {} } as any, "users.delete"),
      ).toThrow("Authorization required");
    }
  });

  it("treats an empty requirement list as satisfied once authenticated", () => {
    mockRequireSession.mockReturnValueOnce({
      userId: "u1",
      token: "server-token",
      profile: { id: "u1" },
      abilities: null,
    });
    const event = { context: {} } as any;

    expect(requireAbility(event, [])).toBeTruthy();
    expect(event.context.authorization).toEqual({
      abilities: [],
      source: "session",
    });
  });

  it("matches abilities case-sensitively", () => {
    expect(hasRequiredAbilities(["Users.Delete"], ["users.delete"])).toBe(
      false,
    );
    expect(hasRequiredAbilities(["USERS.DELETE"], ["users.delete"])).toBe(
      false,
    );
    // role: prefix never implies unrelated abilities.
    expect(hasRequiredAbilities(["role:admin"], ["users.delete"])).toBe(false);
    expect(hasRequiredAbilities(["users.delete"], ["role:admin"])).toBe(false);
  });
});
