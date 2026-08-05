import { expect, test } from "@playwright/test";

test.describe("OBS-01B test-enabled build", () => {
  test.skip(
    process.env.VITE_OBSERVABILITY_TEST_MODE !== "true",
    "Requires the explicit OBS-01B test build flag.",
  );

  test("handled capture stays local and boundary fallback returns home", async ({ page }) => {
    const sentryRequests: string[] = [];
    page.on("request", (request) => {
      if (/sentry|ingest/i.test(request.url())) sentryRequests.push(request.url());
    });

    await page.goto("/__observability-test");
    await expect(page.getByRole("heading", { name: "OBS-01B live verification" })).toBeVisible();
    await page.getByRole("button", { name: "Send handled test exception" }).click();
    await expect(page.getByText("Test exception capture requested.", { exact: false })).toBeVisible();
    expect(sentryRequests).toEqual([]);

    await page.getByRole("button", { name: "Trigger Error Boundary" }).click();
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    await page.getByRole("button", { name: "Back to Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Roulette");
    expect(sentryRequests).toEqual([]);
  });
});
