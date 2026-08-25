import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Lets unit tests (including DOM-environment component tests) resolve
      // the "#app" specifier without a Nuxt build. Tests mock it via vi.mock.
      "#app": fileURLToPath(new URL("./test/stubs/app.ts", import.meta.url)),
    },
  },
  test: {
    fileParallelism: false,
  },
});
