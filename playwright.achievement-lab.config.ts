import { chromium, defineConfig, devices } from "@playwright/test";

import { resolveBrowserExecutable } from "./scripts/resolve-browser-executable.js";

const browserExecutable = resolveBrowserExecutable(chromium.executablePath());

export default defineConfig({
  testDir: "./tests/dev",
  workers: 2,
  use: { baseURL: "http://127.0.0.1:5173", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: {
    ...devices["Desktop Chrome"],
    launchOptions: browserExecutable.executablePath
      ? { executablePath: browserExecutable.executablePath }
      : undefined,
  } }],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/__dev/achievement-animations",
    reuseExistingServer: false,
  },
  outputDir: "test-results/achievement-lab",
});
