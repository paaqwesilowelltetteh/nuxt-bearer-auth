/**
 * Phase 4 UI authorization evaluator.
 *
 * Pure, synchronous, client-safe ability evaluation shared by the <Can> and
 * <Cannot> components. It mirrors — but deliberately does not replace — the
 * frozen Phase 3 matchers (`hasRequiredAbilities` in the route middleware and
 * in `nuxt-bearer-auth/server`):
 *
 * - Matching is exact string equality. No wildcards, prefix hierarchy,
 *   inheritance, or role implication.
 * - mode "all" (default) requires every listed ability; "any" requires at
 *   least one.
 * - An empty requirement means "no restriction" and is allowed. This is
 *   identical to the route metadata and server matcher behavior.
 * - Malformed authorization state (null, undefined, non-array values, empty
 *   arrays) fails closed: it can never satisfy a non-empty requirement.
 * - A requirement that is not an array fails closed.
 * - Non-string requirement entries can never match an ability: under "all"
 *   their presence therefore denies, and under "any" they cannot contribute a
 *   grant on their own.
 *
 * The evaluator never throws for malformed input and never mutates its
 * arguments.
 */
export function evaluateAbilities(
  state: unknown,
  requirement: unknown,
  mode: "all" | "any" = "all",
): boolean {
  // Only an array requirement is evaluable; anything else is malformed input
  // from the caller and must fail closed rather than grant access.
  if (!Array.isArray(requirement)) {
    return false;
  }

  // Empty requirement == no restriction (route/server parity).
  if (requirement.length === 0) {
    return true;
  }

  // Fail closed on missing or malformed ability state (mirrors the frozen
  // Phase 3 helpers).
  if (!Array.isArray(state) || state.length === 0) {
    return false;
  }

  return mode === "any"
    ? requirement.some(
        (ability) => typeof ability === "string" && state.includes(ability),
      )
    : requirement.every(
        (ability) => typeof ability === "string" && state.includes(ability),
      );
}
