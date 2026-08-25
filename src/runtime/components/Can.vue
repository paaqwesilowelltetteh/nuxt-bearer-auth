<script setup lang="ts">
/**
 * <Can> renders its default slot only when the current authorization state
 * satisfies the required abilities (exact matching, mode defaults to "all").
 * When unauthorized, it renders the optional #fallback slot, or nothing.
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
  <slot v-if="authorized" />
  <slot v-else name="fallback" />
</template>
