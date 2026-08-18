import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const PROFILE_STORAGE_KEY = "roulettechess.player-profile.v1";

async function startLocalMatch(page: Page): Promise<void> {
  await page.goto("/play");
  await page.getByRole("button", { name: /start game|oyunu başlat/i }).click();
  await expect(page.locator(".board")).toBeVisible({ timeout: 15_000 });
}

test("exit dialog pauses play, is keyboard safe and returns focus to the game", async ({
  page,
  assertNoErrors,
}) => {
  await startLocalMatch(page);
  const exitButton = page.getByRole("button", { name: /leave match|maçtan ayrıl/i });
  const rollButton = page.getByRole("button", { name: /^roll$|^zar at$/i });

  await rollButton.click();
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute(
    "data-roll-phase",
    "resolved",
    { timeout: 3_000 },
  );
  await expect(page.locator(".chess-clock.is-active")).toHaveCount(1);

  await exitButton.click();
  const dialog = page.getByRole("dialog", { name: /leave this match|bu maçtan ayrıl/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/will not earn xp|xp kazanmazsın/i);
  await expect(dialog).not.toContainText(/rating|reyting/i);
  const returnButton = dialog.getByRole("button", { name: /return to game|oyuna dön/i });
  await expect(returnButton).toBeFocused();
  await expect(page.locator(".chess-clock.is-active")).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: /leave match|maçtan ayrıl/i })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(returnButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(exitButton).toBeFocused();
  await expect(page.locator(".chess-clock.is-active")).toHaveCount(1);
  assertNoErrors();
});

test("confirmed abandon returns to Setup without result, XP, stats or stale callbacks", async ({
  page,
  assertNoErrors,
}) => {
  await page.goto("/play");
  const profileBefore = await page.evaluate((key) => localStorage.getItem(key), PROFILE_STORAGE_KEY);
  await page.getByRole("button", { name: /start game|oyunu başlat/i }).click();
  await expect(page.locator(".board")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^roll$|^zar at$/i }).click();
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "spinning");
  await page.getByRole("button", { name: /leave match|maçtan ayrıl/i }).click();
  await page.getByRole("dialog").getByRole("button", {
    name: /leave match|maçtan ayrıl/i,
  }).click();

  await expect(page).toHaveURL(/\/play$/);
  await expect(page.locator(".board")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /game over|oyun bitti/i })).toHaveCount(0);
  await page.waitForTimeout(1_500);
  await expect(page).toHaveURL(/\/play$/);
  const profileAfter = await page.evaluate((key) => localStorage.getItem(key), PROFILE_STORAGE_KEY);
  expect(profileAfter).toBe(profileBefore);
  assertNoErrors();
});

test("browser Back requests confirmation and the exit control remains reachable on mobile", async ({
  page,
  assertNoErrors,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startLocalMatch(page);
  const exitButton = page.getByRole("button", { name: /leave match|maçtan ayrıl/i });
  await expect(exitButton).toBeVisible();
  await page.goBack();

  const dialog = page.getByRole("dialog", { name: /leave this match|bu maçtan ayrıl/i });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/game$/);
  await dialog.getByRole("button", { name: /return to game|oyuna dön/i }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".board")).toBeVisible();
  assertNoErrors();
});

test("browser Back behaves normally after the match has completed", async ({
  page,
  assertNoErrors,
}) => {
  await page.addInitScript(() => {
    let clock = 2_000_000_000_000;
    Date.now = () => {
      clock += 35_000;
      return clock;
    };
  });
  await page.goto("/play");
  await page.getByRole("radio", { name: "1+0", exact: true }).check();
  await page.getByRole("button", { name: /start game|oyunu başlat/i }).click();
  await expect(page.locator(".board")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^roll$|^zar at$/i }).click();
  await expect(page.locator(".game-result-dialog")).toBeVisible({
    timeout: 5_000,
  });

  await page.goBack();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("dialog", { name: /leave this match|bu maçtan ayrıl/i })).toHaveCount(0);
  assertNoErrors();
});
