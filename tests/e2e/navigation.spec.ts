import { expect, test } from "./fixtures";

test("critical routes and back navigation render without browser errors", async ({ page, assertNoErrors }) => {
  const monitoringRequests: string[] = [];
  page.on("request", (request) => {
    if (/sentry|ingest/i.test(request.url())) monitoringRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Roulette");
  const homeMachine = page.locator(".home-machine-frame");
  await expect(homeMachine).toHaveAttribute("fetchpriority", "high");
  await expect(homeMachine).toHaveJSProperty("complete", true);
  await expect.poll(() => homeMachine.evaluate((image) => image.currentSrc)).not.toBe("");
  expect(await homeMachine.evaluate((image) => image.currentSrc)).toMatch(/machine-(?:1x|2x|mobile)-.*\.webp$/);
  expect(await page.locator(".home-machine picture source").count()).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("update-machine-transparent")))).toBe(false);
  const homeTitle = await page.title();

  for (const path of ["/play", "/game", "/how-to-play", "/profile", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.title()).not.toBe(homeTitle);
  }

  await page.goto("/settings");
  await page.getByRole("link", { name: /home|ana sayfa/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/unknown-route");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Roulette");
  await page.goto("/__observability-test");
  if (process.env.VITE_OBSERVABILITY_TEST_MODE === "true") {
    await expect(page.getByRole("heading", { name: "OBS-01B live verification" })).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Roulette");
  }
  assertNoErrors();
  expect(monitoringRequests).toEqual([]);
});
