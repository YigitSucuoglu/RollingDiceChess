import { chromium, defineConfig, devices } from "@playwright/test";

import { resolveBrowserExecutable } from "./scripts/resolve-browser-executable.js";

const browserExecutable = resolveBrowserExecutable(chromium.executablePath());

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: browserExecutable.executablePath
      ? "off"
      : "retain-on-failure",
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      launchOptions: browserExecutable.executablePath
        ? { executablePath: browserExecutable.executablePath }
        : undefined,
    },
  }],
  webServer: {
    command: "npm run serve:e2e",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  outputDir: "test-results",
});
