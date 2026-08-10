import { chromium, defineConfig, devices } from "@playwright/test";

import { resolveBrowserExecutable } from "./scripts/resolve-browser-executable.js";

const chromiumExecutable = resolveBrowserExecutable(chromium.executablePath());
const chromiumLaunchOptions = chromiumExecutable.executablePath
  ? { executablePath: chromiumExecutable.executablePath }
  : undefined;

export default defineConfig({
  testDir: "./tests/qualification",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: chromiumLaunchOptions },
    },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "android-chromium-emulated",
      use: { ...devices["Pixel 5"], launchOptions: chromiumLaunchOptions },
    },
    { name: "iphone-webkit-emulated", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  outputDir: "test-results/qualification",
});
