import { describe, expect, it } from "vitest";

import {
  assertPermissionDenied,
  isPermissionDenied,
} from "../../scripts/data-01a-remote-security.mjs";

describe("DATA-01A remote result classification", () => {
  it("accepts only explicit PostgreSQL/RLS permission failures", () => {
    expect(isPermissionDenied({ code: "42501", message: "permission denied" })).toBe(true);
    expect(isPermissionDenied({ code: "unknown", message: "new row violates row-level security policy" })).toBe(true);
    expect(isPermissionDenied({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
  });

  it("rejects successful or unrelated failures as security evidence", () => {
    expect(() => assertPermissionDenied("attack", { error: null })).toThrow(/mutation succeeded/);
    expect(() => assertPermissionDenied("attack", {
      error: { code: "23505", message: "duplicate key" },
    })).toThrow(/expected permission denial/);
    expect(() => assertPermissionDenied("attack", {
      error: { code: "42501", message: "permission denied" },
    })).not.toThrow();
  });
});
