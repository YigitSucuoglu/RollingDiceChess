import { expect, test } from "@playwright/test";

const route = "/__dev/achievement-animations";

test("both concepts play, replay and reset without stale animation", async ({ page }) => {
  await page.goto(route);
  await expect(page.getByRole("heading", { name: "Achievement Animation Lab" })).toBeVisible();
  await expect(page.locator(".achievement-lab-animation")).toHaveCount(0);
  await page.getByRole("button", { name: "Play Animation" }).click();
  await expect(page.locator('[data-concept="progress"][data-status="playing"]')).toBeVisible();
  await expect(page.locator(".golden-reveal-manual")).toHaveCSS("animation-name", "golden-reveal-hold");
  const progressCard = (await page.locator(".golden-reveal-card").boundingBox())!;
  expect(progressCard.width).toBeGreaterThan(250);
  expect(progressCard.width).toBeLessThanOrEqual(401);
  await page.waitForTimeout(1700);
  await page.screenshot({ path: "test-results/achievement-lab-progress-preview.png" });
  await expect(page.locator('[data-concept="progress"][data-status="complete"]')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator(".golden-reveal-card").getByRole("button", { name: "OK" })).toBeVisible();
  await expect(page.locator(".golden-reveal-manual")).toHaveCSS("opacity", "1");
  await page.waitForTimeout(1000);
  await expect(page.locator(".golden-reveal-card")).toBeVisible();
  await page.locator(".golden-reveal-card").getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".achievement-lab-animation")).toHaveCount(0);
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(page.locator(".achievement-lab-animation")).toHaveCount(1);
  await page.getByRole("button", { name: "Golden Seal" }).click();
  await expect(page.locator(".achievement-lab-animation")).toHaveCount(0);
  await page.getByRole("button", { name: "Play Animation" }).click();
  await expect(page.locator('[data-concept="seal"][data-status="playing"]')).toBeVisible();
  await expect(page.locator(".achievement-lab-seal-emblem")).toHaveCSS("width", "120px");
  await expect(page.locator(".achievement-lab-seal-emblem")).toHaveCSS("height", "120px");
  await expect(page.locator(".achievement-lab-seal-emblem")).toHaveCSS("animation-duration", "0.6s, 0.72s");
  expect(await page.locator(".achievement-lab-seal-emblem").evaluate((element) =>
    getComputedStyle(element, "::after").animationDuration)).toBe("0.72s");
  await expect(page.locator(".achievement-lab-seal-copy > span")).toHaveCSS("font-size", "13.12px");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "test-results/achievement-lab-seal-preview.png" });
  await expect(page.locator('[data-concept="seal"][data-status="complete"]')).toHaveCount(1, { timeout: 5000 });
  await page.locator(".achievement-lab-seal-panel").getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".achievement-lab-animation")).toHaveCount(0);
});

test("samples and secret challenge do not expose numeric progress", async ({ page }) => {
  await page.goto(route);
  await page.getByLabel("Sample achievement").selectOption("pawn");
  await page.getByRole("button", { name: "Play Animation" }).click();
  await expect(page.locator(".golden-reveal-progress strong")).toHaveText("499/500");
  await page.getByLabel("Sample achievement").selectOption("untouchable");
  await page.getByRole("button", { name: "Play Animation" }).click();
  await expect(page.getByRole("heading", { name: "Untouchable" })).toBeVisible();
  await expect(page.locator(".golden-reveal-track")).toHaveCount(0);
  await expect(page.locator(".golden-reveal-progress strong")).toHaveCount(0);
});

test("pending state and multiple unlocks use the real card sequentially", async ({ page }) => {
  await page.goto(route);
  await page.getByLabel("Notification state").selectOption("pending");
  await page.getByLabel("Multiple unlock sequence").check();
  await page.getByRole("button", { name: "Play Animation" }).click();
  await expect(page.locator(".golden-reveal[data-kind='pending']")).toHaveCount(1);
  await expect(page.locator(".golden-reveal-card")).toHaveCount(1);
  await expect(page.locator(".golden-reveal-card").getByRole("heading", { name: "Ranked Victor" })).toBeVisible();
  await page.locator(".golden-reveal-card").getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".golden-reveal-card").getByRole("heading", { name: "Pawn Commander" })).toBeVisible();
  await expect(page.locator(".golden-reveal-card")).toHaveCount(1);
});

test("responsive stage remains contained and reduced motion keeps content visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [360, 800]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(route);
    await page.getByRole("button", { name: "Golden Seal" }).click();
    await page.getByRole("button", { name: "Play Animation" }).click();
    await expect(page.getByRole("heading", { name: "Ranked Victor" })).toBeVisible();
    await expect(page.locator(".achievement-lab-seal-copy")).toHaveCSS("opacity", "1");
    await expect(page.locator('[data-concept="seal"][data-status="complete"]')).toHaveCount(1);
    await expect(page.locator(".achievement-lab-seal-panel .achievement-lab-ok")).toHaveCSS("animation-name", "none");
    await page.locator(".achievement-lab-seal-panel").getByRole("button", { name: "OK" }).click();
    await expect(page.locator(".achievement-lab-animation")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
