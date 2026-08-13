import { describe, expect, it } from "vitest";

import {
  isBenignBrowserCancellation,
  isHttpFailure,
} from "../e2e/network-failure-classifier";

describe("qualification network failure classification", () => {
  it("accepts only a navigation-superseded Firefox image cancellation", () => {
    expect(isBenignBrowserCancellation({
      browserName: "firefox",
      errorText: "NS_BINDING_ABORTED",
      resourceType: "image",
      supersededByNavigation: true,
    })).toBe(true);
  });

  it.each([
    ["chromium", "NS_BINDING_ABORTED", "image", true],
    ["firefox", "NS_BINDING_ABORTED", "script", true],
    ["firefox", "NS_BINDING_ABORTED", "image", false],
    ["firefox", "NS_ERROR_NET_RESET", "image", true],
  ])("keeps unrelated request failures fatal", (
    browserName,
    errorText,
    resourceType,
    supersededByNavigation,
  ) => {
    expect(isBenignBrowserCancellation({
      browserName,
      errorText,
      resourceType,
      supersededByNavigation,
    })).toBe(false);
  });

  it("keeps real HTTP failures fatal", () => {
    expect(isHttpFailure(404)).toBe(true);
    expect(isHttpFailure(403)).toBe(true);
    expect(isHttpFailure(500)).toBe(true);
    expect(isHttpFailure(399)).toBe(false);
  });
});
