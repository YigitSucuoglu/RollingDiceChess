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

test("ready host sees authoritative opponent actions and safe Start transition", async ({ page }) => {
  await useCloudGuestFixture(page);
  await page.addInitScript(() => window.localStorage.setItem("roulettechess.e2e-multiplayer-fixture.v1", "ready-host"));
  await page.goto("/multiplayer");
  await expect(page.getByText("Yigit #19F1P")).toBeVisible();
  await expect(page.getByText("Guest4921 #7K2M9")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kick Player" })).toBeVisible();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByRole("heading", { name: "Match created" })).toBeVisible();
  await expect(page.getByText("The secure game connection is being prepared.")).toBeVisible();
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
