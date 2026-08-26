import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    /** Pure unit tests — no DB required */
    reporters: ["default"],
  },
});
