import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;

if (!baseURL) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL is required. Set it to the HTTPS Vercel deployment URL before running deployed E2E tests.",
  );
}

const deploymentURL = new URL(baseURL);
if (deploymentURL.protocol !== "https:") {
  throw new Error("PLAYWRIGHT_BASE_URL must use HTTPS for deployed E2E tests.");
}

export default defineConfig({
  testDir: "./tests/deployed",
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: deploymentURL.origin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{
    name: "deployed-chromium",
    use: {
      ...devices["Desktop Chrome"],
      launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : undefined,
    },
  }],
  outputDir: "test-results/deployed",
});
