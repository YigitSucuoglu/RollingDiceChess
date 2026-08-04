import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/engine/**/*.test.ts", "tests/services/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
