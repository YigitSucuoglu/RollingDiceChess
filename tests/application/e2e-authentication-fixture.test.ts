import { describe, expect, it } from "vitest";

import {
  createE2ECloudSnapshot,
  resolveE2EAuthFixture,
} from "../../src/infrastructure/testing/E2EAuthenticationAdapter";

describe("deterministic E2E authentication fixture", () => {
  it("defaults to the local fallback and selects cloud only explicitly", () => {
    expect(resolveE2EAuthFixture(null)).toBe("local");
    expect(resolveE2EAuthFixture("unexpected")).toBe("local");
    expect(resolveE2EAuthFixture("cloud")).toBe("cloud");
  });

  it("exposes a stable cloud Guest without credentials", () => {
    const snapshot = createE2ECloudSnapshot();
    expect(snapshot).toMatchObject({
      playerId: "12345678-1234-4123-8123-123456789012",
      multiplayerRating: 1000,
      profile: { displayName: "Guest1234" },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/accessToken|refreshToken|password|supabase/i);
  });
});
