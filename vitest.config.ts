import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // The sync server is plain ESM with no build step, so its tests are .mjs
    // and sit beside it rather than under src.
    include: ["src/**/*.test.ts", "server/**/*.test.mjs"],
  },
});
