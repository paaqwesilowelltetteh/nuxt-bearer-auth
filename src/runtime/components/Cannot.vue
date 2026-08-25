<script setup lang="ts">
/**
 * <Cannot> renders its default slot only when the current authorization state
 * does NOT satisfy the required abilities. It is the exact negation of the
 * same evaluator result used by <Can> — no separate matching logic.
 * When authorized, it renders the optional #fallback slot, or nothing.
 *
 * UI authorization controls rendering only. It never secures API requests;
 * your backend must authorize every request it receives.
 */
import {
  useAbilityRequirement,
  type CanComponentProps,
} from "./useAbilityRequirement";

const props = defineProps<CanComponentProps>();

const { authorized } = useAbilityRequirement(props);
</script>

<template>
  <slot v-if="!authorized" />
  <slot v-else name="fallback" />
</template>
