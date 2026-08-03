import { expect, test } from "./fixtures";

test("deterministic human roll animates, resolves and records a legal move", async ({ page, assertNoErrors }) => {
  await page.goto("/play");
  await page.getByRole("button", { name: /start game|oyunu başlat/i }).click();
  await expect(page.locator(".board")).toBeVisible();
  const roll = page.getByRole("button", { name: /^roll$|^zar at$/i });
  await expect(roll).toBeEnabled();
  await roll.click();
  await expect(page.locator(".slot-machine-lever-layer")).toHaveClass(/is-pulling/);
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "spinning");
  await expect(page.locator(".slot-machine-frame")).toHaveAttribute("data-roll-phase", "resolved", { timeout: 3_000 });

  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
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
