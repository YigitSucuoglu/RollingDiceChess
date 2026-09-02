import { expect, test, useAuthenticationFixture, useCloudGuestFixture } from "./fixtures";

test("Profile defaults to Singleplayer and exposes canonical Multiplayer statistics", async ({
  page,
  assertNoErrors,
}) => {
  await useAuthenticationFixture(page, "account");
  await page.goto("/profile");

  const singleplayer = page.getByRole("button", { name: "Singleplayer", exact: true });
  const multiplayer = page.getByRole("button", { name: "Multiplayer", exact: true });
  await expect(singleplayer).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Games Played", { exact: true })).toBeVisible();
  await expect(page.getByText(/games played against bots/i)).toBeVisible();

  await multiplayer.focus();
  await expect(multiplayer).toBeFocused();
  await multiplayer.press("Enter");
  await expect(multiplayer).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Games Played", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Rating", { exact: true })).toBeVisible();
  await expect(page.getByText("1,125", { exact: true })).toBeVisible();
  await expect(page.getByText("Ranked Games", { exact: true })).toBeVisible();
  await expect(page.getByText("Ranked Wins", { exact: true })).toBeVisible();
  await expect(page.getByText("Ranked Losses", { exact: true })).toBeVisible();
  await expect(page.getByText("57.1%", { exact: true })).toBeVisible();
  await expect(page.getByText("Current Ranked Win Streak", { exact: true })).toBeVisible();
  await expect(page.getByText("Best Ranked Win Streak", { exact: true })).toBeVisible();
  await expect(page.getByText("Unranked Games", { exact: true })).toBeVisible();
  await expect(page.getByText("Total Multiplayer Play Time", { exact: true })).toBeVisible();
  await expect(page.getByText("2m", { exact: true })).toBeVisible();
  await expect(page.getByText("Multiplayer Kings Captured", { exact: true })).toBeVisible();
  await expect(page.getByText("Multiplayer Roulette Rolls", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Activity" }).getByText("5", { exact: true })).toBeVisible();
  await expect(page.getByText(/unranked matches count only toward games played/i)).toBeVisible();
  const globalSection = page.locator('[data-global-statistics="true"]');
  const headlineCards = globalSection.locator(".profile-roulette-grid");
  await expect(headlineCards.getByText("Knight", { exact: true })).toBeVisible();
  await expect(globalSection.getByText("39 rolls", { exact: true })).toBeVisible();
  await expect(headlineCards.getByText("Pawn", { exact: true })).toBeVisible();
  await expect(globalSection.getByText("84 moves", { exact: true })).toBeVisible();
  await expect(globalSection.getByText("81.3%", { exact: true })).toBeVisible();
  await expect(globalSection.getByText("126 / 155 turns", { exact: true })).toBeVisible();
  await expect(globalSection.locator(".profile-triple-rolls-list > li")).toHaveCount(6);
  expect(await globalSection.locator(".profile-triple-rolls-list > li").evaluateAll((items) =>
    items.map((item) => `${item.getAttribute("data-rank")}:${item.getAttribute("data-column")}`),
  )).toEqual(["1:left", "2:left", "3:left", "4:right", "5:right", "6:right"]);
  await expect(globalSection.locator('[data-column="left"]')).toHaveCount(3);
  await expect(globalSection.locator('[data-column="right"]')).toHaveCount(3);
  await expect(page.getByText("Most Successful Piece", { exact: true })).toHaveCount(0);
  await singleplayer.click();
  await expect(globalSection.getByText("39 rolls", { exact: true })).toBeVisible();
  await expect(globalSection.getByText("84 moves", { exact: true })).toBeVisible();
  await expect(globalSection.getByText("126 / 155 turns", { exact: true })).toBeVisible();
  assertNoErrors();
});

test("zero-state Multiplayer statistics remain explicit and finite", async ({ page, assertNoErrors }) => {
  await useCloudGuestFixture(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Multiplayer", exact: true }).click();
  const view = page.locator('[data-statistics-view="multiplayer"]');
  await expect(view.getByText("1,000", { exact: true })).toBeVisible();
  await expect(view.getByText("0%", { exact: true })).toBeVisible();
  await expect(view.getByText("0", { exact: true })).toHaveCount(8);
  await expect(view).not.toContainText(/NaN|Infinity/);
  const globalSection = page.locator('[data-global-statistics="true"]');
  await expect(globalSection.getByText("0 rolls", { exact: true })).toBeVisible();
  await expect(globalSection.getByText("0 moves", { exact: true })).toBeVisible();
  await expect(globalSection.getByText("0 / 0 turns", { exact: true })).toBeVisible();
  await expect(globalSection.locator(".profile-triple-rolls-list > li")).toHaveCount(6);
  assertNoErrors();
});

test("Turkish mobile Profile statistics fit without horizontal overflow", async ({ page, assertNoErrors }) => {
  await page.addInitScript(() => {
    localStorage.setItem("roulettechess.settings.v1", JSON.stringify({ schemaVersion: 1, language: "tr" }));
  });
  await useAuthenticationFixture(page, "account");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profile");
  await page.getByRole("button", { name: "Çok Oyunculu", exact: true }).click();
  await expect(page.getByText("Dereceli Galibiyet Oranı", { exact: true })).toBeVisible();
  await expect(page.getByText("Derecesiz Maçlar", { exact: true })).toBeVisible();
  await expect(page.getByText("Üçlü Ruletler", { exact: true })).toBeVisible();
  const tripleList = page.locator(".profile-triple-rolls-list");
  await expect(tripleList).toHaveCSS("display", "block");
  await expect(tripleList.locator(":scope > li")).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  assertNoErrors();
});

test("missing canonical Multiplayer data does not break the Profile", async ({ page, assertNoErrors }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Multiplayer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/temporarily unavailable/i);
  await expect(page.getByRole("heading", { name: "Player", exact: true })).toBeVisible();
  assertNoErrors();
});
