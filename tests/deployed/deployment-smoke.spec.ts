import { expect, test, type Page } from "@playwright/test";

function guardPage(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    failures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return failures;
}

test("deployed RouletteChess routes and critical flow work over HTTPS", async ({ page }) => {
  const failures = guardPage(page);
  await page.addInitScript(() => {
    Math.random = () => 0;
  });

  for (const path of ["/", "/settings", "/profile", "/how-to-play"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(page.url()).toMatch(/^https:\/\//);
    await page.reload();
    await expect(page.locator("main")).toBeVisible();
  }

  await page.goto("/");
  await expect(page).toHaveTitle(/RouletteChess/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".home-machine-frame")).toBeVisible();
  expect(await page.locator(".home-machine-frame").evaluate((image) => image.currentSrc))
    .toMatch(/machine-(?:1x|2x|mobile)-.*\.webp$/);

  await page.goto("/settings");
  const sound = page.getByRole("switch");
  await sound.click();
  const language = page.locator("#settings-language");
  await language.selectOption("tr");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await language.selectOption("en");

  await page.goto("/play");
  await page.getByRole("button", { name: /start game|oyunu baÅŸlat/i }).click();
  await expect(page.locator(".board")).toBeVisible();
  const roll = page.getByRole("button", { name: /^roll$|^zar at$/i });
  await roll.click();
  await expect(page.locator(".slot-machine-lever-layer")).toHaveClass(/is-pulling/);
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "resolved", {
    timeout: 3_000,
  });

  expect(failures, failures.join("\n")).toEqual([]);
});
