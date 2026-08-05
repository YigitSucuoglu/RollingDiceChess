import { describe, expect, it, vi } from "vitest";
import type { Breadcrumb, CaptureContext } from "@sentry/react";
import {
  ObservabilityClient,
  sanitizeBreadcrumb,
  scrubObservabilityEvent,
  type ObservabilitySdk,
} from "../../src/observability/Observability";

function createSdk(): ObservabilitySdk {
  return {
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(() => "event"),
    captureMessage: vi.fn(() => "event"),
    flush: vi.fn(async () => true),
    init: vi.fn(),
    setContext: vi.fn(),
    setTag: vi.fn(),
  };
}

const configured = {
  deploymentEnvironment: "production",
  dsn: "https://public@example.invalid/1",
  language: "en",
  production: true,
  release: "roulettechess@test",
};

describe("ObservabilityClient", () => {
  it("is a no-op without a production DSN", () => {
    for (const config of [{ ...configured, dsn: undefined }, { ...configured, production: false }]) {
      const sdk = createSdk();
      const client = new ObservabilityClient(sdk);
      client.initialize(config);
      client.captureException(new Error("ignored"));
      expect(sdk.init).not.toHaveBeenCalled();
      expect(sdk.captureException).not.toHaveBeenCalled();
      expect(client.isEnabled()).toBe(false);
    }
  });

  it("initializes once and sends only allowlisted context", () => {
    const sdk = createSdk();
    const client = new ObservabilityClient(sdk);
    client.initialize(configured);
    client.initialize(configured);
    client.captureException(new Error("boom"), {
      area: "game-ui",
      operation: "critical asset preload",
      route: "/play?private=value#fragment",
    });

    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    const context = vi.mocked(sdk.captureException).mock.calls[0][1] as CaptureContext;
    expect(context).toMatchObject({
      contexts: { route: { path: "/play" } },
      tags: { area: "game-ui", operation: "critical-asset-preload", route: "/play" },
    });
  });

  it("scrubs PII-prone event fields and URL details", () => {
    const event = scrubObservabilityEvent({
      breadcrumbs: [
        { category: "console", message: "private" },
        { category: "navigation", data: { from: "/?token=a", to: "/play?name=b#x" } },
      ],
      contexts: { app: { release: "safe" }, profile: { name: "private" } },
      extra: { localStorage: "private" },
      request: {
        cookies: { session: "secret" },
        data: "secret",
        headers: { authorization: "secret" },
        method: "GET",
        url: "https://example.test/play?token=secret#private",
      },
      tags: { area: "app", playerName: "private" },
      user: { email: "private@example.test" },
    });

    expect(event.user).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.request).toEqual({ method: "GET", url: "/play" });
    expect(event.contexts).toEqual({ app: { release: "safe" } });
    expect(event.tags).toEqual({ area: "app" });
    expect(event.breadcrumbs).toEqual([
      { category: "navigation", data: { from: "/", to: "/play" }, message: undefined },
    ]);
  });

  it("keeps monitoring failures isolated from the application", () => {
    const sdk = createSdk();
    vi.mocked(sdk.captureException).mockImplementation(() => { throw new Error("sdk failed"); });
    const client = new ObservabilityClient(sdk);
    client.initialize(configured);
    expect(() => client.captureException(new Error("app failed"))).not.toThrow();
  });
});

describe("breadcrumb policy", () => {
  it("drops interaction and network breadcrumbs", () => {
    for (const category of ["console", "ui.click", "fetch", "xhr"]) {
      expect(sanitizeBreadcrumb({ category } as Breadcrumb)).toBeNull();
    }
  });
});
