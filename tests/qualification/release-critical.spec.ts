import type { Locator } from "@playwright/test";

import { expect, test } from "../e2e/fixtures";

async function activate(locator: Locator, useTouch: boolean): Promise<void> {
  if (useTouch) await locator.tap();
  else await locator.click();
}

test("release-critical game journey works across the qualification matrix", async ({ page, assertNoErrors }, testInfo) => {
  test.setTimeout(75_000);
  const useTouch = /android|iphone/.test(testInfo.project.name);
  let releaseMachine: (() => void) | undefined;
  const machineGate = new Promise<void>((resolve) => { releaseMachine = resolve; });
  await page.route(/game-machine(?:-[^/?]+)?\.webp/, async (route) => {
    await machineGate;
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Roulette");
  await activate(page.getByRole("button", { name: /^singleplayer$|^tek oyunculu$/i }), useTouch);
  await expect(page).toHaveURL(/\/play$/);
  const startGame = page.getByRole("button", { name: /start game|oyunu başlat/i });
  await startGame.scrollIntoViewIfNeeded();
  await activate(startGame, useTouch);
  await expect(page.getByRole("status")).toBeVisible();
  releaseMachine?.();
  await expect(page.locator(".board")).toBeVisible({ timeout: 15_000 });

  const roll = page.getByRole("button", { name: /^roll$|^zar at$/i });
  await activate(roll, useTouch);
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "spinning");
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "resolved", { timeout: 3_000 });
  await expect(page.locator(".chess-clock.is-active")).toHaveCount(1);

  for (const [from, to] of [["e2", "e4"], ["e4", "e5"], ["e5", "e6"]] as const) {
    await activate(page.locator(`[data-square="${from}"]`), useTouch);
    await expect(page.locator(".move-dot")).not.toHaveCount(0);
    await activate(page.locator(`[data-square="${to}"]`), useTouch);
  }

  await expect(page.locator(".turn-text")).toContainText(/black|siyah/i);
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "spinning", { timeout: 2_000 });
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "resolved", { timeout: 3_000 });
  await expect(page.locator(".turn-text")).toContainText(/white|beyaz/i, { timeout: 25_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  assertNoErrors();
});

test("public routes, refresh, storage fallback and language remain healthy", async ({ page, assertNoErrors }) => {
  await page.goto("/profile");
  await expect(page.locator("main")).toBeVisible();
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  for (const path of ["/settings", "/how-to-play", "/game", "/unknown-release-route"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
  }
  await expect(page).toHaveURL(/\/$/);

  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => { throw new DOMException("Storage unavailable", "SecurityError"); },
    });
  });
  await page.goto("/settings");
  const guestEntry = page.getByRole("button", { name: /play as guest|misafir olarak oyna/i });
  await expect(page.locator("#settings-language").or(guestEntry)).toBeVisible();
  if (await guestEntry.isVisible()) await guestEntry.click();
  await expect(page.locator("#settings-language")).toBeVisible();
  await page.locator("#settings-language").selectOption("tr");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page).toHaveTitle(/Ayarlar/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  assertNoErrors();
});
