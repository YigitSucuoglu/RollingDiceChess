import { expect, test as base, type Page } from "@playwright/test";

export async function installErrorGuards(page: Page): Promise<void> {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText})`));
  await page.addInitScript(() => {
    Math.random = () => 0;
    try {
      window.localStorage.setItem("roulettechess.auth-mode.v1", "guest");
    } catch {
      // Storage-denial tests intentionally replace localStorage afterwards.
    }
  });
  page.on("close", () => expect(failures, failures.join("\n")).toEqual([]));
  Object.defineProperty(page, "__qaFailures", { value: failures });
}

export const test = base.extend<{ assertNoErrors: () => void }>({
  page: async ({ page }, provide) => {
    await installErrorGuards(page);
    await provide(page);
  },
  assertNoErrors: async ({ page }, provide) => {
    await provide(() => {
      const failures = (page as Page & { __qaFailures: string[] }).__qaFailures;
      expect(failures, failures.join("\n")).toEqual([]);
    });
  },
});

export { expect };
