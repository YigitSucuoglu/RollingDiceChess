import { expect, test, useCloudGuestFixture } from "./fixtures";

test("sound and language preferences persist", async ({ page, assertNoErrors }) => {
  await page.goto("/settings");
  const sound = page.getByRole("switch");
  const before = await sound.getAttribute("aria-checked");
  await sound.click();
  await page.reload();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");

  const language = page.locator("#settings-language");
  await language.selectOption("tr");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page).toHaveTitle(/Ayarlar/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await page.locator("#settings-language").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  assertNoErrors();
});

test("cloud canonical profile cannot be reset from local settings", async ({ page, assertNoErrors }) => {
  await useCloudGuestFixture(page);
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /cloud profile reset unavailable/i })).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assertNoErrors();
});

test("local fallback profile retains the local reset flow", async ({ page, assertNoErrors }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /reset profile/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /cancel/i }).click();
  await expect(dialog).toBeHidden();
  assertNoErrors();
});
