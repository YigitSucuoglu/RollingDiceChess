import { expect, test, useAccountMigrationFixture, useCloudGuestFixture } from "./fixtures";

test("cloud Guest profile remains usable for gameplay entry", async ({
  page,
  assertNoErrors,
}) => {
  await useCloudGuestFixture(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Guest", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Guest\d{4}$/ })).toBeVisible();
  await expect(page.getByText(/browser\/site data is cleared/i)).toBeVisible();
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("button", { name: /start game/i })).toBeVisible();
  assertNoErrors();
});

test("cloud Guest upgrades without conflict and Google branding stays accessible", async ({ page, assertNoErrors }) => {
  await useAccountMigrationFixture(page, "upgrade");
  await page.goto("/profile");
  const connect = page.getByRole("button", { name: "Connect Google" });
  await expect(connect.locator("svg.google-mark")).toBeVisible();
  await connect.focus();
  await expect(connect).toBeFocused();
  await connect.click();
  await expect(page.getByRole("heading", { name: "Signed in with Google" })).toBeVisible();
  await expect(page.getByText(/selected progression is protected/i)).toBeVisible();
  assertNoErrors();
});

for (const scenario of [
  { fixture: "conflict-guest", button: "Use Guest Progress" },
  { fixture: "conflict-google", button: "Use Google Progress" },
] as const) {
  test(`profile conflict resolves ${scenario.fixture}`, async ({ page, assertNoErrors }) => {
    await useAccountMigrationFixture(page, scenario.fixture);
    await page.goto("/profile");
    await page.getByRole("button", { name: "Connect Google" }).click();
    const conflict = page.getByLabel("Choose which progress to keep");
    await expect(conflict).toBeVisible();
    await expect(page.getByRole("heading", { name: "Google sign-in successful" })).toBeVisible();
    await expect(page.getByText(/finish connecting your account/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Signed in with Google" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign Out" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Play", exact: true })).toHaveCount(0);
    await expect(conflict.getByText("Guest1234")).toBeVisible();
    await expect(conflict.getByText("Player", { exact: true })).toBeVisible();
    await expect(conflict.getByText(/will not be combined/i)).toBeVisible();
    await page.getByRole("button", { name: scenario.button }).click();
    await expect(page.getByRole("heading", { name: "Signed in with Google" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose which progress to keep" })).toHaveCount(0);
    await expect(page.getByRole("heading", {
      name: scenario.fixture === "conflict-google" ? "Player" : "Guest1234",
      exact: true,
    })).toBeVisible();
    await expect(page.getByText(
      scenario.fixture === "conflict-google" ? /70\s*\/\s*100 XP/ : /50\s*\/\s*100 XP/,
    )).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", {
      name: scenario.fixture === "conflict-google" ? "Player" : "Guest1234",
      exact: true,
    })).toBeVisible();
    await expect(page.getByText(
      scenario.fixture === "conflict-google" ? /70\s*\/\s*100 XP/ : /50\s*\/\s*100 XP/,
    )).toBeVisible();
    assertNoErrors();
  });
}

test("leaving an unresolved conflict preserves it for safe resume", async ({ page, assertNoErrors }) => {
  await useAccountMigrationFixture(page, "conflict-guest");
  await page.goto("/profile");
  await page.getByRole("button", { name: "Connect Google" }).click();
  await page.getByRole("link", { name: "RouletteChess" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Choose which progress to keep" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Google sign-in successful" })).toBeVisible();
  assertNoErrors();
});

test("lost resolution response can be retried without changing the choice", async ({ page, assertNoErrors }) => {
  await useAccountMigrationFixture(page, "resolution-failure");
  await page.goto("/profile");
  await page.getByRole("button", { name: "Connect Google" }).click();
  await page.getByRole("button", { name: "Use Guest Progress" }).click();
  await expect(page.getByRole("alert")).toContainText(/retry safely/i);
  await page.getByRole("button", { name: "Use Guest Progress" }).click();
  await expect(page.getByRole("heading", { name: "Signed in with Google" })).toBeVisible();
  assertNoErrors();
});

test("local fallback Guest remains usable without Supabase configuration", async ({
  page,
  assertNoErrors,
}) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Guest", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Player", exact: true })).toBeVisible();
  await expect(page.getByText(/cloud is temporarily unavailable/i)).toBeVisible();
  await expect(page.getByText(/browser\/site data is cleared/i)).toHaveCount(0);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/play$/);
  assertNoErrors();
});
