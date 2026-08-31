import { expect, test, useCloudGuestFixture } from "./fixtures";

test("local-only Guest sees the online profile requirement", async ({ page }) => {
  await page.goto("/multiplayer");
  await expect(page.getByRole("heading", { name: "Multiplayer" })).toBeVisible();
  await expect(page.getByText("Multiplayer requires an online player profile.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play Singleplayer" })).toBeVisible();
});

test("cloud player browses and joins a real-shaped public lobby fixture", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.goto("/multiplayer");
  await expect(page.getByRole("heading", { name: "Open Lobbies" })).toBeVisible();
  await expect(page.getByText("Yigit #19F1P")).toBeVisible();
  await expect(page.getByText("Rating 1248")).toBeVisible();
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Guest4921 #7K2M9")).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave Lobby", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kick Player" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Match" })).toHaveCount(0);
});

test("private lobby creation preserves leading-zero code and host settings", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.goto("/multiplayer");
  await page.getByRole("button", { name: /Create Lobby/ }).click();
  await page.getByLabel("Private").check();
  await page.getByLabel("Unranked").check();
  await page.getByLabel("White").check();
  await page.getByLabel("Time Control").selectOption("rapid-10-0");
  await page.getByRole("button", { name: "Create Lobby", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Private Lobby" })).toBeVisible();
  await expect(page.getByText("004921")).toBeVisible();
  await expect(page.getByText("Unranked")).toBeVisible();
  await expect(page.getByText("White")).toBeVisible();
});

test("ready host starts and enters the authoritative multiplayer Game", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.addInitScript(() => window.localStorage.setItem("roulettechess.e2e-multiplayer-fixture.v1", "ready-host"));
  await page.goto("/multiplayer");
  await expect(page.getByText("Yigit #19F1P")).toBeVisible();
  await expect(page.getByText("Guest4921 #7K2M9")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kick Player" })).toBeVisible();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page).toHaveURL(/\/game\/33333333-/u);
  await expect(page.locator(".slot-machine-frame")).toBeVisible();
  await expect(page.getByRole("button", { name: "ROLL" })).toHaveCount(0);
  await expect(page.getByText("Yigit #19F1P")).toBeVisible();
  await expect(page.getByText("Guest4921 #7K2M9")).toBeVisible();
  await expect(page.locator("[data-square='a2']")).toBeVisible();
});

test("valid active membership restores the real Game without lobby actions", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.addInitScript(() => window.localStorage.setItem("roulettechess.e2e-multiplayer-fixture.v1", "active"));
  await page.goto("/multiplayer");
  await expect(page).toHaveURL(/\/game\/33333333-/u);
  await expect(page.getByRole("button", { name: /Close Lobby|Leave Lobby/u })).toHaveCount(0);
});

test("legacy active membership recovers without sign out and stays released after refresh", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("roulettechess.e2e-multiplayer-fixture.v1", "legacy-active"));
  await page.goto("/multiplayer");
  await expect(page.getByText(/incompatible development match was safely closed/iu)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open Lobbies" })).toBeVisible();
  await page.getByRole("button", { name: /Create Lobby/ }).click();
  await page.getByRole("button", { name: "Create Lobby", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Public Lobby" })).toBeVisible();
  await page.getByRole("button", { name: "Close Lobby" }).click();
  await expect(page.getByRole("heading", { name: "Open Lobbies" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Open Lobbies" })).toBeVisible();
});

test("authoritative fixture accepts a legal intent and restores on refresh", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.goto("/game/33333333-3333-4333-8333-333333333333");
  await expect(page.locator(".roll-slots")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "ROLL" })).toHaveCount(0);
  await page.waitForTimeout(1100);
  await page.locator("[data-square='a2']").click();
  await expect(page.locator("[data-square='a2']")).toHaveClass(/selected/u);
  await page.waitForTimeout(50);
  await page.locator("[data-square='a3']").click();
  await expect(page.locator("[data-square='a3'] .piece")).toBeVisible();
  await page.reload();
  await expect(page.locator(".slot-machine-frame")).toBeVisible();
});

test("ranked multiplayer leave warns about rating and returns to Multiplayer", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.goto("/game/33333333-3333-4333-8333-333333333333");
  await page.getByRole("button", { name: "Leave match" }).click();
  await expect(page.getByText(/count as a loss.*rating/iu)).toBeVisible();
  await page.getByRole("button", { name: "Leave Match" }).click();
  await expect(page).toHaveURL(/\/multiplayer/u);
});

test("Home exposes equal game modes and the Leaderboard placeholder", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Singleplayer", "Multiplayer", "Profile", "Leaderboard", "Settings", "How to Play"]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
  const metrics = await page.evaluate(() => {
    const boxes = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].map((node) => node.getBoundingClientRect());
    return { primary: boxes(".home-primary-actions .home-action"), secondary: boxes(".home-secondary-actions .home-action") };
  });
  expect(metrics.primary[0].width).toBeCloseTo(metrics.primary[1].width, 0);
  expect(metrics.primary[0].height).toBeCloseTo(metrics.primary[1].height, 0);
  expect(metrics.secondary.every((box) => Math.abs(box.width - metrics.secondary[0].width) < 1)).toBe(true);
  expect(metrics.secondary[0].top - metrics.primary[0].bottom).toBeGreaterThanOrEqual(20);
  await page.getByRole("button", { name: "Leaderboard" }).click();
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  await expect(page.getByText("Coming soon")).toBeVisible();
});

test("multiplayer Game and Home remain overflow-safe at 390x844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useCloudGuestFixture(page);
  await page.goto("/game/33333333-3333-4333-8333-333333333333");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("desktop multiplayer gameplay shell is centered without changing its intrinsic width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await useCloudGuestFixture(page);
  await page.goto("/game/33333333-3333-4333-8333-333333333333");
  const layout = await page.locator(".multiplayer-game-shell").evaluate((shell) => {
    const box = shell.getBoundingClientRect();
    return {
      centerDelta: Math.abs((box.left + box.right) / 2 - window.innerWidth / 2),
      shellWidth: box.width,
      viewportWidth: window.innerWidth,
    };
  });
  expect(layout.centerDelta).toBeLessThanOrEqual(1);
  expect(layout.shellWidth).toBeLessThan(layout.viewportWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("multiplayer clocks keep authoritative ratings paired with the oriented players", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.addInitScript(() => window.localStorage.setItem("roulettechess.e2e-multiplayer-side", "black"));
  await page.goto("/game/33333333-3333-4333-8333-333333333333");
  const clocks = page.locator(".chess-clock");
  await expect(clocks.first()).toContainText("YIGIT");
  await expect(clocks.first()).toContainText("1248");
  await expect(clocks.last()).toContainText("GUEST4921");
  await expect(clocks.last()).toContainText("1032");
});

test("unranked gameplay shows player ratings but no terminal rating change", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("roulettechess.e2e-multiplayer-mode", "unranked");
    window.localStorage.setItem("roulettechess.e2e-multiplayer-match-state", "terminal");
  });
  await page.goto("/game/33333333-3333-4333-8333-333333333333");
  await expect(page.getByLabel("Player rating 1248")).toBeVisible();
  await expect(page.getByLabel("Player rating 1032")).toBeVisible();
  await expect(page.locator(".game-result-rating")).toHaveCount(0);
});

test("ranked terminal snapshot renders authoritative rating feedback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useCloudGuestFixture(page);
  await page.addInitScript(() => window.localStorage.setItem("roulettechess.e2e-multiplayer-match-state", "terminal"));
  await page.goto("/game/33333333-3333-4333-8333-333333333333");
  const feedback = page.locator(".game-result-rating");
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText("1248");
  await expect(feedback).toContainText("1223");
  await expect(feedback).toContainText("-25");
});

test("ranked rating animation reaches the authoritative winning value", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("roulettechess.e2e-multiplayer-side", "black");
    window.localStorage.setItem("roulettechess.e2e-multiplayer-match-state", "terminal");
  });
  await page.goto("/game/33333333-3333-4333-8333-333333333333");
  const feedback = page.locator(".game-result-rating");
  await expect(feedback).toContainText("1032");
  await expect(feedback).toContainText("+25");
  await expect(feedback.locator("strong")).toHaveText("1057", { timeout: 2_000 });
});

test("six-digit private join validates input and stays usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useCloudGuestFixture(page);
  await page.goto("/multiplayer");
  await page.getByRole("button", { name: "Join Private Lobby" }).click();
  const input = page.getByLabel("Lobby Code");
  await input.fill("004921");
  await page.locator("form").getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Guest4921 #7K2M9")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Leave Lobby", exact: true })).toBeInViewport();
});

test("mobile Multiplayer owns vertical scrolling and keeps Create Lobby reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useCloudGuestFixture(page);
  await page.goto("/multiplayer");
  await page.getByRole("button", { name: /Create Lobby/ }).click();
  const createAction = page.getByRole("button", { name: "Create Lobby", exact: true }).last();
  const scrollOwnership = await page.locator(".multiplayer-page").evaluate((container) => {
    container.scrollTop = container.scrollHeight;
    return {
      clientHeight: container.clientHeight,
      rootScrollTop: document.documentElement.scrollTop,
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
    };
  });
  expect(scrollOwnership.scrollHeight).toBeGreaterThan(scrollOwnership.clientHeight);
  expect(scrollOwnership.scrollTop).toBeGreaterThan(0);
  expect(scrollOwnership.rootScrollTop).toBe(0);
  await createAction.scrollIntoViewIfNeeded();

  const metrics = await page.locator(".multiplayer-page").evaluate((container, action) => {
    const actionBox = (action as HTMLElement).getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    return {
      actionBottom: actionBox.bottom,
      actionTop: actionBox.top,
      clientHeight: container.clientHeight,
      containerBottom: containerBox.bottom,
      containerTop: containerBox.top,
      rootScrollTop: document.documentElement.scrollTop,
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
      viewportWidth: window.innerWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
    };
  }, await createAction.elementHandle());

  expect(metrics.actionTop).toBeGreaterThanOrEqual(metrics.containerTop - 1);
  expect(metrics.actionBottom).toBeLessThanOrEqual(metrics.containerBottom + 1);
  expect(metrics.rootScrollTop).toBe(0);
  expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  await createAction.click();
  await expect(page.getByRole("heading", { name: "Public Lobby" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Lobby" })).toBeInViewport();
});
