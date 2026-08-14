import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/application/**/*.test.ts",
      "tests/engine/**/*.test.ts",
      "tests/profile/**/*.test.ts",
      "tests/services/**/*.test.{ts,tsx}",
    ],
    environment: "node",
    restoreMocks: true,
  },
});
