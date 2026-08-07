import { expect, test } from "./fixtures";

test("deterministic human roll animates, resolves and records a legal move", async ({ page, assertNoErrors }) => {
  await page.goto("/play");
  await page.getByRole("button", { name: /start game|oyunu başlat/i }).click();
  await expect(page.locator(".board")).toBeVisible();
  const roll = page.getByRole("button", { name: /^roll$|^zar at$/i });
  await expect(roll).toBeEnabled();
  await roll.dblclick();
  await expect(page.locator(".slot-machine-lever-layer")).toHaveClass(/is-pulling/);
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "spinning");
  await expect(page.locator(".chess-clock.is-active")).toHaveCount(0);
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "resolved", { timeout: 3_000 });
  await expect(page.locator(".chess-clock.is-active")).toHaveCount(1);

  const e2 = page.locator('[data-square="e2"]');
  const e4 = page.locator('[data-square="e4"]');
  await e2.click();
  await expect(e2).toHaveClass(/selected/);
  await expect(page.locator(".move-dot")).not.toHaveCount(0);
  await e4.dblclick();
  await expect(e4.locator(".piece")).toBeVisible();
  await expect(e2.locator(".piece")).toHaveCount(0);
  await page.locator('[data-square="e4"]').click();
  await page.locator('[data-square="e5"]').click();
  await page.locator('[data-square="e5"]').click();
  await page.locator('[data-square="e6"]').click();
  await page.getByRole("button", { name: /history|geçmiş/i }).click();
  await expect(page.locator("#move-history-panel")).toContainText(/e4/i);
  await expect(page.locator(".turn-text")).toContainText(/black|siyah/i);
  await expect(page.locator(".turn-text")).toContainText(/white|beyaz/i, { timeout: 12_000 });
  assertNoErrors();
});
