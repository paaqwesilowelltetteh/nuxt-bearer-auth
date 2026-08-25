// Minimal stand-in so Vite can statically resolve the "#app" alias in unit
// tests that do not boot Nuxt (required for component tests running under a
// DOM environment). Behavior is overridden per-test with vi.mock("#app").
export default {};
