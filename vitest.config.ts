import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/engine/**/*.test.ts", "tests/services/**/*.test.{ts,tsx}"],
    environment: "node",
    restoreMocks: true,
  },
});
