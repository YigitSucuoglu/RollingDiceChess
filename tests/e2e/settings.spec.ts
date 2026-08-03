import { expect, test } from "./fixtures";

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

test("profile reset confirmation supports cancel and confirm in isolated context", async ({ page, assertNoErrors }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /reset profile|profili sıfırla/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /cancel|iptal/i }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /reset profile|profili sıfırla/i }).click();
  await dialog.getByRole("button", { name: /^reset$|^sıfırla$/i }).click();
  await expect(dialog).toBeHidden();
  assertNoErrors();
});
