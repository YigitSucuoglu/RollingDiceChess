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

test("desktop statistics views use the same available width", async ({ page, assertNoErrors }) => {
  await useAuthenticationFixture(page, "account");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/profile");
  const single = page.locator('[data-statistics-view="singleplayer"]');
  const singleWidth = (await single.boundingBox())!.width;
  const singleCardWidth = (await single.locator(".profile-stat-card").first().boundingBox())!.width;
  await page.getByRole("button", { name: "Multiplayer", exact: true }).click();
  const multi = page.locator('[data-statistics-view="multiplayer"]');
  const multiWidth = (await multi.boundingBox())!.width;
  const rankedCardWidth = (await multi.locator(".profile-multiplayer-ranked-grid .profile-stat-card").first().boundingBox())!.width;
  const activity = multi.locator(".profile-multiplayer-activity-grid");
  const activityBox = (await activity.boundingBox())!;
  expect(Math.abs(singleWidth - multiWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(singleCardWidth - rankedCardWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(activityBox.width - multiWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  assertNoErrors();
});

test("Profile Hero keeps identity, balanced career metrics and full-width XP across viewports", async ({ page, assertNoErrors }) => {
  await useAuthenticationFixture(page, "account");
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [360, 800]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/profile");
    const hero = page.locator(".profile-identity");
    await expect(hero.getByRole("heading", { name: "Yigit" })).toBeVisible();
    await expect(hero.getByText("#7K2M9")).toBeVisible();
    await expect(hero.getByRole("button", { name: "Change Username" })).toBeVisible();
    await expect(hero.getByText("Singleplayer level")).toBeVisible();
    await expect(hero.getByText("Multiplayer rating", { exact: true })).toBeVisible();
    await expect(hero.getByRole("progressbar")).toBeVisible();
    await expect(hero.getByText(/70\s*\/\s*100 XP/)).toBeVisible();
    await expect(hero.getByRole("heading", { name: "Signed in with Google" })).toBeVisible();
    await expect(hero.getByRole("button", { name: "Sign Out" })).toBeVisible();
    const geometry = await hero.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const top = element.querySelector(".profile-identity-top")!.getBoundingClientRect();
      const account = element.querySelector(".profile-account")!.getBoundingClientRect();
      const avatar = element.querySelector(".profile-monogram")!.getBoundingClientRect();
      const columns = [...element.querySelectorAll(".profile-career-metric")].map((node) => node.getBoundingClientRect());
      const track = element.querySelector(".profile-progress-track")!.getBoundingClientRect();
      const joined = element.querySelector(".profile-joined")!.getBoundingClientRect();
      return { bounds: { left: bounds.left, right: bounds.right }, topBottom: top.bottom,
        account: { left: account.left, right: account.right, top: account.top, bottom: account.bottom },
        avatarWidth: avatar.width,
        columns: columns.map((box) => ({ x: box.x, width: box.width, top: box.top })),
        track: { left: track.left, right: track.right, width: track.width },
        joined: { left: joined.left, right: joined.right, top: joined.top } };
    });
    expect(Math.abs(geometry.columns[0].width - geometry.columns[1].width)).toBeLessThanOrEqual(2);
    expect(geometry.columns[0].top).toBeGreaterThanOrEqual(geometry.topBottom);
    expect(geometry.track.width).toBeGreaterThan(geometry.columns[0].width + geometry.columns[1].width - 24);
    expect(geometry.joined.top).toBeGreaterThan(geometry.columns[0].top);
    expect(geometry.joined.right).toBeLessThanOrEqual(geometry.bounds.right);
    expect(geometry.track.left).toBeGreaterThanOrEqual(geometry.bounds.left);
    expect(geometry.track.right).toBeLessThanOrEqual(geometry.bounds.right);
    expect(geometry.account.right).toBeLessThanOrEqual(geometry.bounds.right);
    expect(geometry.avatarWidth).toBe(width <= 560 ? 68 : 112);
    if (width > 700) expect(geometry.account.left).toBeGreaterThanOrEqual(geometry.bounds.left + 200);
    else expect(geometry.account.top).toBeGreaterThanOrEqual(geometry.topBottom);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 1440 || width === 390) {
      await hero.screenshot({ path: `test-results/profile-hero-${width}x${height}.png` });
    }
  }
  assertNoErrors();
});

test("Account information popover supports pointer, keyboard, outside dismissal and localization", async ({ page, assertNoErrors }) => {
  await useAuthenticationFixture(page, "account");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profile");
  const trigger = page.getByRole("button", { name: "Account information" });
  const panel = page.getByRole("tooltip");
  await trigger.hover();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("offline progress will synchronize");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await trigger.click();
  await page.mouse.move(0, 0);
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(panel).toBeVisible();
  const panelBounds = (await panel.boundingBox())!;
  expect(panelBounds.x).toBeGreaterThanOrEqual(0);
  expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(391);
  await page.locator("#player-identity-title").click();
  await expect(panel).toHaveCount(0);
  assertNoErrors();
});

test("Guest account information keeps the existing warning in English and Turkish", async ({ page, assertNoErrors }) => {
  await useCloudGuestFixture(page);
  await page.goto("/profile");
  await expect(page.locator(".profile-identity").getByRole("heading", { name: "Guest", exact: true })).toBeVisible();
  await expect(page.locator(".profile-identity").getByRole("button", { name: "Connect Google" })).toBeVisible();
  await page.getByRole("button", { name: "Account information" }).click();
  await expect(page.getByRole("tooltip")).toContainText("Guest progress may become inaccessible");

  await page.addInitScript(() => {
    localStorage.setItem("roulettechess.settings.v1", JSON.stringify({ schemaVersion: 1, language: "tr" }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Hesap bilgisi" }).click();
  await expect(page.getByRole("tooltip")).toContainText("Misafir ilerlemesine erişilemeyebilir");
  assertNoErrors();
});

test("Profile Hero contains a long renamed account identity on narrow mobile", async ({ page, assertNoErrors }) => {
  await useAuthenticationFixture(page, "account");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/profile");
  await page.getByRole("button", { name: "Change Username" }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("VeryLongRouletteChampion");
  await page.getByRole("button", { name: "Save" }).click();
  const title = page.locator("#player-identity-title");
  await expect(title).toHaveText("VeryLongRouletteChampion");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const contained = await title.evaluate((element) => {
    const titleBounds = element.getBoundingClientRect();
    const heroBounds = element.closest(".profile-identity")!.getBoundingClientRect();
    return titleBounds.left >= heroBounds.left && titleBounds.right <= heroBounds.right;
  });
  expect(contained).toBe(true);
  assertNoErrors();
});

test("local Guest Hero keeps unavailable multiplayer rating distinct from zero", async ({ page, assertNoErrors }) => {
  await page.addInitScript(() => localStorage.setItem("roulettechess.e2e-auth-fixture.v1", "local"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profile");
  const hero = page.locator(".profile-identity");
  await expect(hero.getByLabel("Multiplayer rating unavailable")).toBeVisible();
  await expect(hero.getByRole("progressbar")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
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
  await expect(page.locator('[data-statistics-view="multiplayer"]').getByRole("status")).toContainText(/temporarily unavailable/i);
  await expect(page.getByRole("heading", { name: "Player", exact: true })).toBeVisible();
  assertNoErrors();
});
