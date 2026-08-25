import { computed } from "vue";
import type { AuthorizationMatchMode } from "../../types";
import { useBearerAuth } from "../composables/useBearerAuth";
import { evaluateAbilities } from "../utils/abilities";

/**
 * Props shared by the <Can> and <Cannot> UI authorization components.
 */
export interface CanComponentProps {
  /**
   * Single required ability. Takes precedence over `abilities` when both are
   * provided.
   */
  ability?: string;
  /**
   * Multiple required abilities, evaluated with `mode`. An empty array means
   * "no restriction", matching route metadata and server semantics.
   */
  abilities?: string[];
  /**
   * "all" (default) requires every listed ability; "any" requires at least
   * one. Exact string equality; identical to Phase 3 enforcement semantics.
   */
  mode?: AuthorizationMatchMode;
}

/**
 * Shared evaluation for <Can>/<Cannot>: normalizes component props into a
 * requirement and evaluates it against the existing client authorization
 * state (`useState("bearer-auth-abilities")`) through the pure Phase 4
 * evaluator. No new authorization state is created and nothing is fetched.
 *
 * Prop normalization:
 * - `ability` (string) becomes a single-entry requirement.
 * - `abilities` arrays pass through to the evaluator (empty => allowed).
 * - Absent props mean "no restriction" — same as an empty requirement.
 * - A provided but non-array `abilities` value is malformed and fails closed.
 *
 * The result is reactive: login, refresh, logout, and session replacement all
 * update `auth.abilities`, so components re-render automatically.
 */
export function useAbilityRequirement(props: CanComponentProps) {
  const auth = useBearerAuth();

  const requirement = computed<unknown>(() => {
    if (typeof props.ability === "string") {
      return [props.ability];
    }
    if (Array.isArray(props.abilities)) {
      return props.abilities;
    }
    if (props.abilities == null) {
      return [];
    }
    // Malformed non-array requirement: handed to the evaluator unchanged so
    // it can fail closed deterministically.
    return props.abilities;
  });

  const authorized = computed(() =>
    evaluateAbilities(auth.abilities.value, requirement.value, props.mode),
  );

  return { authorized };
}
