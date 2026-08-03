import { expect, test } from "./fixtures";

test("critical routes and back navigation render without browser errors", async ({ page, assertNoErrors }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Roulette");
  const homeTitle = await page.title();

  for (const path of ["/play", "/how-to-play", "/profile", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.title()).not.toBe(homeTitle);
  }

  await page.goto("/settings");
  await page.getByRole("link", { name: /home|ana sayfa/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/unknown-route");
  await expect(page.locator("body")).toBeVisible();
  assertNoErrors();
});
