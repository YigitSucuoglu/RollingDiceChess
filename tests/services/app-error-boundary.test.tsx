import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import AppErrorBoundary from "../../src/observability/AppErrorBoundary";

function textOf(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

describe("AppErrorBoundary", () => {
  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await i18n.changeLanguage("en");
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
    vi.restoreAllMocks();
  });

  it("reports once, shows localized fallback, and retries without reloading", async () => {
    let shouldThrow = true;
    const report = vi.fn();
    function RecoverableChild() {
      if (shouldThrow) throw new Error("test failure");
      return <p>Recovered safely</p>;
    }

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AppErrorBoundary reportException={report}>
          <RecoverableChild />
        </AppErrorBoundary>,
      );
    });
    expect(textOf(renderer)).toContain("Something went wrong");
    expect(report).toHaveBeenCalledTimes(1);

    shouldThrow = false;
    await act(async () => {
      renderer.root.findAllByType("button")[0].props.onClick();
    });
    expect(textOf(renderer)).toContain("Recovered safely");
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("renders Turkish copy and preserves browser storage on home navigation", async () => {
    await i18n.changeLanguage("tr");
    const navigateHome = vi.fn();
    const report = vi.fn();
    const clearStorage = vi.fn();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { clear: clearStorage },
    });
    function BrokenChild(): React.ReactNode {
      throw new Error("test failure");
    }

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AppErrorBoundary navigateHome={navigateHome} reportException={report}>
          <BrokenChild />
        </AppErrorBoundary>,
      );
    });
    expect(textOf(renderer)).toContain("Bir şeyler ters gitti");
    await act(async () => {
      await renderer.root.findAllByType("button")[1].props.onClick();
    });
    expect(navigateHome).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledOnce();
    expect(clearStorage).not.toHaveBeenCalled();
    Reflect.deleteProperty(globalThis, "localStorage");
  });
});
