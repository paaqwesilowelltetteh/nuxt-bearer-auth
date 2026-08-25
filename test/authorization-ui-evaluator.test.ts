import { describe, expect, it } from "vitest";

import { evaluateAbilities } from "../src/runtime/utils/abilities";

describe("evaluateAbilities (Phase 4 UI evaluator)", () => {
  it("matches a single required ability when present", () => {
    expect(evaluateAbilities(["users.view"], ["users.view"])).toBe(true);
  });

  it("denies a single required ability when absent", () => {
    expect(evaluateAbilities(["users.view"], ["users.delete"])).toBe(false);
  });

  it("requires every ability in the default all mode", () => {
    expect(
      evaluateAbilities(["users.view", "users.edit"], [
        "users.view",
        "users.edit",
      ]),
    ).toBe(true);
    expect(
      evaluateAbilities(["users.view"], ["users.view", "users.edit"]),
    ).toBe(false);
  });

  it("supports explicit any matching", () => {
    expect(
      evaluateAbilities(["reports.view"], ["reports.view", "reports.export"], "any"),
    ).toBe(true);
    expect(
      evaluateAbilities(["campaigns.view"], ["reports.view", "reports.export"], "any"),
    ).toBe(false);
  });

  it("treats an omitted mode as all", () => {
    expect(evaluateAbilities(["a"], ["a", "b"])).toBe(false);
    expect(evaluateAbilities(["a", "b"], ["a", "b"])).toBe(true);
  });

  it("uses exact string equality", () => {
    expect(evaluateAbilities(["users.view "], ["users.view"])).toBe(false);
    expect(evaluateAbilities([" users.view"], ["users.view"])).toBe(false);
    expect(evaluateAbilities(["users.viewing"], ["users.view"])).toBe(false);
  });

  it("is case sensitive", () => {
    expect(evaluateAbilities(["Users.View"], ["users.view"])).toBe(false);
    expect(evaluateAbilities(["USERS.VIEW"], ["USERS.VIEW"])).toBe(true);
  });

  it("does not treat shared prefixes as hierarchy", () => {
    expect(evaluateAbilities(["users.view.edit"], ["users.view"])).toBe(false);
    expect(evaluateAbilities(["users.view"], ["users.view.edit"])).toBe(false);
  });

  it("rejects wildcards: users.* never grants users.delete", () => {
    expect(evaluateAbilities(["users.delete"], ["users.*"])).toBe(false);
    expect(evaluateAbilities(["users.*"], ["users.delete"])).toBe(false);
  });

  it("keeps literal wildcard strings as ordinary exact values", () => {
    expect(evaluateAbilities(["users.*"], ["users.*"])).toBe(true);
  });

  it("does not let role: prefixes imply other abilities", () => {
    expect(evaluateAbilities(["role:admin"], ["users.delete"])).toBe(false);
    expect(evaluateAbilities(["role:admin"], ["role:admin"])).toBe(true);
    expect(evaluateAbilities(["role:admin"], ["admin"])).toBe(false);
  });

  it("allows an empty requirement regardless of state", () => {
    expect(evaluateAbilities(["users.view"], [])).toBe(true);
    expect(evaluateAbilities([], [])).toBe(true);
    expect(evaluateAbilities(null, [])).toBe(true);
    expect(evaluateAbilities(undefined, [], "any")).toBe(true);
  });

  it("fails closed on null state", () => {
    expect(evaluateAbilities(null, ["users.view"])).toBe(false);
  });

  it("fails closed on undefined state", () => {
    expect(evaluateAbilities(undefined, ["users.view"])).toBe(false);
  });

  it("fails closed on non-array state shapes", () => {
    expect(evaluateAbilities("users.view", ["users.view"])).toBe(false);
    expect(evaluateAbilities({ ability: "users.view" }, ["users.view"])).toBe(
      false,
    );
    expect(evaluateAbilities(42, ["users.view"])).toBe(false);
    expect(evaluateAbilities(true, ["users.view"])).toBe(false);
  });

  it("fails closed on empty ability state", () => {
    expect(evaluateAbilities([], ["users.view"])).toBe(false);
    expect(evaluateAbilities([], ["users.view"], "any")).toBe(false);
  });

  it("fails closed on malformed requirements", () => {
    expect(evaluateAbilities(["users.view"], null)).toBe(false);
    expect(evaluateAbilities(["users.view"], undefined)).toBe(false);
    expect(evaluateAbilities(["users.view"], "users.view")).toBe(false);
    expect(evaluateAbilities(["users.view"], { ability: "users.view" })).toBe(
      false,
    );
    expect(evaluateAbilities(["users.view"], 42)).toBe(false);
  });

  it("never lets non-string requirement entries grant access", () => {
    // all mode: a junk entry cannot be satisfied, so the whole check denies
    expect(
      evaluateAbilities(["users.view"], ["users.view", 42 as never]),
    ).toBe(false);
    // any mode: junk entries alone can never grant
    expect(evaluateAbilities(["users.view"], [42 as never], "any")).toBe(false);
    // any mode: a valid entry still decides the outcome on its own merit
    expect(
      evaluateAbilities(["users.view"], ["users.view", 42 as never], "any"),
    ).toBe(true);
  });

  it("ignores unknown modes by falling back to all semantics", () => {
    expect(
      evaluateAbilities(
        ["users.view"],
        ["users.view", "users.edit"],
        "some" as never,
      ),
    ).toBe(false);
    expect(
      evaluateAbilities(["users.view"], ["users.view"], "some" as never),
    ).toBe(true);
  });

  it("does not mutate its inputs", () => {
    const state = ["users.view", "users.edit"];
    const requirement = ["users.view"];
    const stateCopy = [...state];
    const requirementCopy = [...requirement];

    evaluateAbilities(state, requirement);
    evaluateAbilities(state, requirement, "any");

    expect(state).toEqual(stateCopy);
    expect(requirement).toEqual(requirementCopy);
  });

  it("never throws for arbitrary garbage input", () => {
    const garbage: unknown[] = [
      null,
      undefined,
      0,
      "",
      Symbol("x"),
      () => {},
      { nested: { deep: true } },
      [["users.view"]],
    ];

    for (const state of garbage) {
      for (const requirement of garbage) {
        expect(() =>
          evaluateAbilities(state, requirement as never),
        ).not.toThrow();
        expect(evaluateAbilities(state, requirement as never)).toBe(false);
      }
    }
  });
});
