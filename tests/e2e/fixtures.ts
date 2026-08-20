import { expect, test as base, type Page, type Request } from "@playwright/test";
import { isBenignBrowserCancellation, isHttpFailure } from "./network-failure-classifier";

interface QaFailureState {
  asserted: boolean;
  flushDeferredFailures(): void;
  failures: string[];
}

interface DeferredFirefoxImageAbort {
  readonly request: Request;
  readonly url: string;
  readonly errorText?: string;
}

const E2E_AUTH_FIXTURE_STORAGE_KEY = "roulettechess.e2e-auth-fixture.v1";

export async function useCloudGuestFixture(page: Page): Promise<void> {
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "cloud");
  }, { key: E2E_AUTH_FIXTURE_STORAGE_KEY });
}

export async function useAuthenticationFixture(
  page: Page,
  fixture: "account" | "onboarding",
): Promise<void> {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: E2E_AUTH_FIXTURE_STORAGE_KEY,
    value: fixture,
  });
}

export async function useAccountMigrationFixture(
  page: Page,
  fixture: "upgrade" | "conflict-guest" | "conflict-google" | "resolution-failure"
    | "recovery-unresolved" | "recovery-resolved-google" | "recovery-response-loss-google",
): Promise<void> {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: E2E_AUTH_FIXTURE_STORAGE_KEY,
    value: fixture,
  });
}

export async function installErrorGuards(page: Page, browserName: string): Promise<QaFailureState> {
  const failures: string[] = [];
  const pendingImages = new Set<Request>();
  const recentlyAbortedImages = new Map<Request, number>();
  const navigationSupersededImages = new WeakSet<Request>();
  const deferredFirefoxImageAborts: DeferredFirefoxImageAbort[] = [];
  const state: QaFailureState = {
    asserted: false,
    failures,
    flushDeferredFailures: () => {
      for (const candidate of deferredFirefoxImageAborts) {
        if (!isBenignBrowserCancellation({
          browserName: "firefox",
          errorText: candidate.errorText,
          resourceType: candidate.request.resourceType(),
          supersededByNavigation: navigationSupersededImages.has(candidate.request),
        })) failures.push(`requestfailed: ${candidate.url} (${candidate.errorText})`);
      }
      deferredFirefoxImageAborts.length = 0;
    },
  };
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("request", (request) => {
    if (/\.supabase\.co(?:\/|$)/i.test(new URL(request.url()).hostname)) {
      failures.push(`forbidden normal-E2E Supabase request: ${request.url()}`);
    }
    if (request.resourceType() === "document") {
      for (const pendingImage of pendingImages) navigationSupersededImages.add(pendingImage);
      const navigationStartedAt = Date.now();
      for (const [abortedImage, abortedAt] of recentlyAbortedImages) {
        if (navigationStartedAt - abortedAt <= 500) navigationSupersededImages.add(abortedImage);
      }
      recentlyAbortedImages.clear();
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
    if (browserName === "firefox" && request.resourceType() === "image"
        && errorText === "NS_BINDING_ABORTED") {
      recentlyAbortedImages.set(request, Date.now());
      deferredFirefoxImageAborts.push({ request, url: request.url(), errorText });
      return;
    }
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
      state.flushDeferredFailures();
      expect(state.failures, state.failures.join("\n")).toEqual([]);
    }
  },
  assertNoErrors: async ({ page }, provide) => {
    await provide(() => {
      const state = (page as Page & { __qaFailureState: QaFailureState }).__qaFailureState;
      state.asserted = true;
      state.flushDeferredFailures();
      expect(state.failures, state.failures.join("\n")).toEqual([]);
    });
  },
});

export { expect };
