import { expect, test } from "./fixtures";

test("cloud Guest profile remains usable for gameplay entry", async ({
  page,
  assertNoErrors,
}) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Guest", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Guest\d{4}$/ })).toBeVisible();
  await expect(page.getByText(/browser\/site data is cleared/i)).toBeVisible();
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("button", { name: /start game/i })).toBeVisible();
  assertNoErrors();
});
