import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppErrorBoundary from "../../src/observability/AppErrorBoundary";
import { isObservabilityTestMode } from "../../src/observability/observabilityTestMode";
import ObservabilityVerificationPage, {
  BOUNDARY_VERIFICATION_MESSAGE,
  HANDLED_VERIFICATION_MESSAGE,
} from "../../src/observability/ObservabilityVerificationPage";

describe("OBS-01B verification gate", () => {
  it("requires the exact build-time value true", () => {
    expect(isObservabilityTestMode(undefined)).toBe(false);
    expect(isObservabilityTestMode("false")).toBe(false);
    expect(isObservabilityTestMode("TRUE")).toBe(false);
    expect(isObservabilityTestMode("1")).toBe(false);
    expect(isObservabilityTestMode("true")).toBe(true);
  });
});

describe("ObservabilityVerificationPage", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("captures one deterministic handled error with only safe context", async () => {
    const report = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ObservabilityVerificationPage reportException={report} />);
    });

    await act(async () => {
      renderer.root.findAllByType("button")[0].props.onClick();
    });

    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0][0]).toMatchObject({ message: HANDLED_VERIFICATION_MESSAGE });
    expect(report.mock.calls[0][1]).toEqual({
      area: "app",
      operation: "obs-01b-handled-verification",
      route: "/__observability-test",
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("capture requested");
  });

  it("throws below the root boundary and renders the existing fallback", async () => {
    const report = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AppErrorBoundary reportException={report}>
          <ObservabilityVerificationPage />
        </AppErrorBoundary>,
      );
    });

    await act(async () => {
      renderer.root.findAllByType("button")[1].props.onClick();
    });

    expect(JSON.stringify(renderer.toJSON())).toContain("Something went wrong");
    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0][0]).toMatchObject({ message: BOUNDARY_VERIFICATION_MESSAGE });
  });

  it("does not access browser storage while rendering or capturing", async () => {
    const getItem = vi.fn();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem },
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ObservabilityVerificationPage reportException={vi.fn()} />);
    });
    await act(async () => {
      renderer.root.findAllByType("button")[0].props.onClick();
    });
    expect(getItem).not.toHaveBeenCalled();
    Reflect.deleteProperty(globalThis, "localStorage");
  });
});
