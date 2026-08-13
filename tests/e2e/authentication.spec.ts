import { expect, test } from "./fixtures";

test("guest mode preserves local profile and gameplay entry", async ({
  page,
  assertNoErrors,
}) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Guest" })).toBeVisible();
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("button", { name: /start game/i })).toBeVisible();
  assertNoErrors();
});
