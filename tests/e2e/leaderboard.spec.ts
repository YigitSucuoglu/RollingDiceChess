import { expect, test } from "./fixtures";

const fixtureKey = "roulettechess.e2e-leaderboard-fixture.v1";
const requestCountKey = "roulettechess.e2e-leaderboard-request-count.v1";
async function useFixture(page: import("@playwright/test").Page, value: string) {
  await page.addInitScript(({ key, fixture }) => window.localStorage.setItem(key, fixture), { key: fixtureKey, fixture: value });
}

test("renders a podium and all Top 100 rows with current player #50 highlighted", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/leaderboard");
  await expect(page.getByRole("list", { name: "Top three ranked players" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.locator(".leaderboard-row.is-current")).toContainText("#50");
  const last = page.locator(".leaderboard-row").last();
  await last.scrollIntoViewIfNeeded(); await expect(last).toContainText("#100"); await expect(last).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("keeps desktop leaderboard and podium horizontally compact", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto("/leaderboard");
  const metrics = await page.locator(".leaderboard-shell").evaluate((shell) => {
    const shellBox = shell.getBoundingClientRect();
    const podium = [...shell.querySelectorAll<HTMLElement>(".leaderboard-podium-player")]
      .map((item) => item.getBoundingClientRect()).sort((first, second) => first.left - second.left);
    const row = shell.querySelector<HTMLElement>(".leaderboard-row");
    const identity = row?.querySelector<HTMLElement>(".leaderboard-identity")?.getBoundingClientRect();
    const rating = row?.querySelector<HTMLElement>(".leaderboard-rating")?.getBoundingClientRect();
    return { shellWidth: shellBox.width, podiumWidths: podium.map((box) => box.width),
      podiumGaps: [podium[1].left - podium[0].right, podium[2].left - podium[1].right],
      identityRatingSpace: identity && rating ? rating.left - identity.right : 0 };
  });
  expect(metrics.shellWidth).toBeLessThanOrEqual(800);
  expect(Math.max(...metrics.podiumWidths)).toBeLessThan(260);
  expect(Math.max(...metrics.podiumGaps)).toBeLessThan(12);
  expect(metrics.identityRatingSpace).toBeLessThan(400);
});

test("highlights current player #1 without duplicating a rank card", async ({ page }) => {
  await useFixture(page, "one"); await page.goto("/leaderboard");
  await expect(page.locator(".leaderboard-podium-player.is-current")).toContainText("Yigit");
  await expect(page.locator(".leaderboard-rank-card")).toHaveCount(0);
});

test("supports a two-player podium", async ({ page }) => {
  await useFixture(page, "two"); await page.goto("/leaderboard");
  await expect(page.locator(".leaderboard-podium-player")).toHaveCount(2);
  await expect(page.locator(".leaderboard-list")).toHaveCount(0);
});

test("shows a separate Your Rank card for a qualified player outside Top 100", async ({ page }) => {
  await useFixture(page, "outside"); await page.goto("/leaderboard");
  await expect(page.locator(".leaderboard-rank-card")).toContainText("#347");
  await expect(page.locator(".leaderboard-rank-card")).toContainText("Yigit");
});

test("shows qualification guidance while preserving Top 100", async ({ page }) => {
  await useFixture(page, "unqualified"); await page.goto("/leaderboard");
  await expect(page.getByText("Play at least 1 ranked match to join the leaderboard.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Global ranked Top 100" })).toBeVisible();
});

test("renders the empty leaderboard state", async ({ page }) => {
  await useFixture(page, "empty"); await page.goto("/leaderboard");
  await expect(page.getByText("No ranked players yet.")).toBeVisible();
});

test("preserves My Rank when Top 100 fails", async ({ page }) => {
  await useFixture(page, "top-error"); await page.goto("/leaderboard");
  await expect(page.getByText("The leaderboard could not be loaded. You can retry.")).toBeVisible();
  await expect(page.locator(".leaderboard-rank-card")).toContainText("#1");
});

test("preserves Top 100 when My Rank fails", async ({ page }) => {
  await useFixture(page, "rank-error"); await page.goto("/leaderboard");
  await expect(page.getByText("Your global rank could not be loaded.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Global ranked Top 100" })).toBeVisible();
});

test("long identity stays contained and Turkish copy remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await useFixture(page, "long");
  await page.addInitScript(() => localStorage.setItem("roulettechess.settings.v1", JSON.stringify({ schemaVersion: 1, language: "tr" }))); await page.goto("/leaderboard");
  const longIdentity = page.getByText("MaximumLengthUsernameTest"); await expect(longIdentity).toBeVisible();
  expect(await longIdentity.evaluate((node) => node.scrollWidth >= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("uses two canonical reads per navigation and coalesces rapid Refresh input", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "0"), requestCountKey);
  await page.getByRole("button", { name: "Leaderboard", exact: true }).click();
  await expect.poll(() => page.evaluate((key) => Number(localStorage.getItem(key)), requestCountKey)).toBe(2);

  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  await refresh.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => page.evaluate((key) => Number(localStorage.getItem(key)), requestCountKey)).toBe(4);

  await page.goto("/");
  await page.getByRole("button", { name: "Leaderboard", exact: true }).click();
  await expect.poll(() => page.evaluate((key) => Number(localStorage.getItem(key)), requestCountKey)).toBe(6);
});
