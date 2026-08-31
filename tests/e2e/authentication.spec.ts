import { expect, test, useAccountMigrationFixture, useAuthenticationFixture, useCloudGuestFixture } from "./fixtures";

test("mandatory account username onboarding blocks routes and survives refresh", async ({ page, assertNoErrors }) => {
  await useAuthenticationFixture(page, "onboarding");
  await page.goto("/game");
  await expect(page.getByRole("heading", { name: "Choose your username" })).toBeVisible();
  await expect(page).toHaveURL(/\/game$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Choose your username" })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Choose your username" })).toBeVisible();

  const input = page.getByRole("textbox", { name: "Username" });
  for (const reserved of ["Guest1842", "guest1842", "GUEST1842", "GuEsT1842"]) {
    await input.fill(reserved);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert")).toContainText("reserved for Guest accounts");
  }

  await page.goto("/");
  await input.fill("RouletteKing");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Singleplayer", exact: true })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "RouletteKing", exact: true })).toBeVisible();
  await expect(page.getByText("#19F1P")).toBeVisible();
  await expect(page.getByLabel("Multiplayer rating 1000")).toBeVisible();
  await expect(page.getByText(/50\s*\/\s*100 XP/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "RouletteKing", exact: true })).toBeVisible();
  assertNoErrors();
});

test("incomplete account can sign out but cannot skip onboarding", async ({ page, assertNoErrors }) => {
  await useAuthenticationFixture(page, "onboarding");
  await page.goto("/");
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page.getByRole("heading", { name: "Choose how to play" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Choose your username" })).toBeVisible();
  assertNoErrors();
});

test("account profile rename preserves discriminator and canonical progress", async ({ page, assertNoErrors }) => {
  await useAuthenticationFixture(page, "account");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Yigit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change Username" }).click();
  const input = page.getByRole("textbox", { name: "Username" });
  await expect(input).toHaveValue("Yigit");
  await input.fill("RouletteKing");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "RouletteKing", exact: true })).toBeVisible();
  await expect(page.getByText("#7K2M9")).toBeVisible();
  await expect(page.getByText(/70\s*\/\s*100 XP/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "RouletteKing", exact: true })).toBeVisible();
  await expect(page.getByText("#7K2M9")).toBeVisible();
  assertNoErrors();
});

test("cloud Guest profile remains usable for gameplay entry", async ({
  page,
  assertNoErrors,
}) => {
  await useCloudGuestFixture(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Guest", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Guest\d{4}$/ })).toBeVisible();
  await expect(page.getByText("#19F1P")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change Username" })).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "Choose your username" })).toBeVisible();
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
    if (scenario.fixture === "conflict-guest") {
      await expect(page.getByRole("heading", { name: "Choose your username" })).toBeVisible();
      await page.getByRole("textbox", { name: "Username" }).fill("RouletteGuest");
      await page.getByRole("button", { name: "Continue" }).click();
    } else {
      await expect(page.getByRole("heading", { name: "Signed in with Google" })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Choose which progress to keep" })).toHaveCount(0);
    await expect(page.getByRole("heading", {
      name: scenario.fixture === "conflict-google" ? "Player" : "RouletteGuest",
      exact: true,
    })).toBeVisible();
    await expect(page.getByText(
      scenario.fixture === "conflict-google" ? /70\s*\/\s*100 XP/ : /50\s*\/\s*100 XP/,
    )).toBeVisible();
    await expect(page.getByText(
      scenario.fixture === "conflict-google" ? "#7K2M9" : "#19F1P",
    )).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", {
      name: scenario.fixture === "conflict-google" ? "Player" : "RouletteGuest",
      exact: true,
    })).toBeVisible();
    await expect(page.getByText(
      scenario.fixture === "conflict-google" ? /70\s*\/\s*100 XP/ : /50\s*\/\s*100 XP/,
    )).toBeVisible();
    await expect(page.getByText(
      scenario.fixture === "conflict-google" ? "#7K2M9" : "#19F1P",
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
  await expect(page.getByRole("heading", { name: "Choose your username" })).toBeVisible();
  assertNoErrors();
});

test("interrupted migration restores unresolved conflict instead of profile unavailable", async ({
  page,
  assertNoErrors,
}) => {
  await useAccountMigrationFixture(page, "recovery-unresolved");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Choose which progress to keep" })).toBeVisible();
  await expect(page.getByText("Guest6660", { exact: true })).toBeVisible();
  await expect(page.getByText("Yigit", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /temporarily unavailable/i })).toHaveCount(0);
  assertNoErrors();
});

test("resolved migration automatically adopts the canonical Google survivor after refresh", async ({
  page,
  assertNoErrors,
}) => {
  await useAccountMigrationFixture(page, "recovery-resolved-google");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Yigit", exact: true })).toBeVisible();
  await expect(page.getByText("#7K2M9")).toBeVisible();
  await expect(page.getByText(/70\s*\/\s*100 XP/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Yigit", exact: true })).toBeVisible();
  await expect(page.getByText("#7K2M9")).toBeVisible();
  assertNoErrors();
});

test("lost Google resolution response converges to the server survivor on Retry", async ({
  page,
  assertNoErrors,
}) => {
  await useAccountMigrationFixture(page, "recovery-response-loss-google");
  await page.goto("/profile");
  const chooseGoogle = page.getByRole("button", { name: "Use Google Progress" });
  await chooseGoogle.click();
  await expect(page.getByRole("alert")).toContainText(/retry safely/i);
  await chooseGoogle.click();
  await expect(page.getByRole("heading", { name: "Yigit", exact: true })).toBeVisible();
  await expect(page.getByText("#7K2M9")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Yigit", exact: true })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Change Username" })).toHaveCount(0);
  await expect(page.getByText(/browser\/site data is cleared/i)).toHaveCount(0);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/play$/);
  assertNoErrors();
});
