import { expect, test as base, type Page, type Request } from "@playwright/test";
import { isBenignBrowserCancellation, isHttpFailure } from "./network-failure-classifier";

interface QaFailureState {
  asserted: boolean;
  failures: string[];
}

export async function installErrorGuards(page: Page, browserName: string): Promise<QaFailureState> {
  const failures: string[] = [];
  const pendingImages = new Set<Request>();
  const navigationSupersededImages = new WeakSet<Request>();
  const state: QaFailureState = { asserted: false, failures };
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("request", (request) => {
    if (request.resourceType() === "document") {
      for (const pendingImage of pendingImages) navigationSupersededImages.add(pendingImage);
    } else if (request.resourceType() === "image") {
      pendingImages.add(request);
    }
  });
  page.on("requestfinished", (request) => pendingImages.delete(request));
  page.on("response", (response) => {
    if (isHttpFailure(response.status())) {
      failures.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    pendingImages.delete(request);
    const errorText = request.failure()?.errorText;
    if (isBenignBrowserCancellation({
      browserName,
      errorText,
      resourceType: request.resourceType(),
      supersededByNavigation: navigationSupersededImages.has(request),
    })) return;
    failures.push(`requestfailed: ${request.url()} (${errorText})`);
  });
  await page.addInitScript(() => {
    Math.random = () => 0;
    try {
      window.localStorage.setItem("roulettechess.auth-mode.v1", "guest");
    } catch {
      // Storage-denial tests intentionally replace localStorage afterwards.
    }
  });
  Object.defineProperty(page, "__qaFailureState", { value: state });
  return state;
}

export const test = base.extend<{ assertNoErrors: () => void }>({
  page: async ({ page, browserName }, provide) => {
    const state = await installErrorGuards(page, browserName);
    await provide(page);
    if (!state.asserted) {
      expect(state.failures, state.failures.join("\n")).toEqual([]);
    }
  },
  assertNoErrors: async ({ page }, provide) => {
    await provide(() => {
      const state = (page as Page & { __qaFailureState: QaFailureState }).__qaFailureState;
      state.asserted = true;
      expect(state.failures, state.failures.join("\n")).toEqual([]);
    });
  },
});

export { expect };
