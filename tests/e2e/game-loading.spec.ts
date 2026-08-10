import { test as failureTest } from "@playwright/test";

import { expect, test } from "./fixtures";

test("mobile setup scrolls to Start Game and waits for delayed critical assets", async ({ page, assertNoErrors }) => {
  let releaseMachine: (() => void) | undefined;
  const machineGate = new Promise<void>((resolve) => { releaseMachine = resolve; });
  await page.route(/game-machine(?:-[^/?]+)?\.webp/, async (route) => {
    await machineGate;
    await route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play", { waitUntil: "domcontentloaded" });

  const startGame = page.getByRole("button", { name: /start game|oyunu baÅŸlat/i });
  await startGame.scrollIntoViewIfNeeded();
  const buttonBox = await startGame.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollTop + document.body.scrollTop)).toBeGreaterThan(0);

  await startGame.click();
  await expect(page.getByRole("status")).toContainText(/preparing the game|oyun haz/i);
  await expect(page.locator(".game-page")).toHaveCount(0);
  releaseMachine?.();
  await expect(page.locator(".board")).toBeVisible({ timeout: 10_000 });
  await page.goBack();
  await expect(page.getByRole("button", { name: /start game|oyunu baÅŸlat/i })).toBeVisible();
  assertNoErrors();
});

test("desktop setup remains usable and duplicate Play input creates one navigation", async ({ page, assertNoErrors }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/play");
  await page.waitForLoadState("networkidle");
  const startGame = page.getByRole("button", { name: /start game|oyunu baÅŸlat/i });
  await expect(startGame).toBeVisible();
  await startGame.dblclick();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator(".board")).toBeVisible({ timeout: 1_000 });
  assertNoErrors();
});

test("setup action remains reachable across mobile and tablet viewports", async ({ page, assertNoErrors }) => {
  const viewportTolerancePx = 1;

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/play");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const startGame = page.getByRole("button", { name: /start game|oyunu baÅŸlat/i });
    await startGame.scrollIntoViewIfNeeded();
    const box = await startGame.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-viewportTolerancePx);
    expect(box!.y).toBeGreaterThanOrEqual(-viewportTolerancePx);
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      viewport.width + viewportTolerancePx,
    );
    expect(box!.y + box!.height).toBeLessThanOrEqual(
      viewport.height + viewportTolerancePx,
    );
  }
  assertNoErrors();
});

failureTest("critical asset failure offers Back to Setup and Retry", async ({ page }) => {
  let failMachine = true;
  await page.route(/game-machine(?:-[^/?]+)?\.webp/, async (route) => {
    if (failMachine) {
      await route.fulfill({ status: 404, body: "missing" });
      return;
    }
    await route.continue();
  });
  await page.goto("/play");
  await page.getByRole("button", { name: /start game|oyunu baÅŸlat/i }).click();
  await expect(page.getByRole("alert")).toContainText(/couldn't prepare|hazırlanamadı/i);
  await page.getByRole("button", { name: /back to setup|ayarlara dön/i }).click();
  await expect(page.getByRole("button", { name: /start game|oyunu baÅŸlat/i })).toBeVisible();

  await page.getByRole("button", { name: /start game|oyunu baÅŸlat/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  failMachine = false;
  await page.getByRole("button", { name: /retry|tekrar dene/i }).click();
  await expect(page.locator(".board")).toBeVisible({ timeout: 10_000 });
});
