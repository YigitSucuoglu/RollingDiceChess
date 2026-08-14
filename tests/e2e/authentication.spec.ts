import { expect, test, useCloudGuestFixture } from "./fixtures";

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
