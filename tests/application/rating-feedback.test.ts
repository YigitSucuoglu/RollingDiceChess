import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  RATING_ANIMATION_DURATION_MS,
  interpolateRating,
} from "../../src/components/GameResultModal/ratingAnimation";

describe("authoritative rating feedback presentation", () => {
  it("interpolates the complete integer range and always lands on the canonical final value", () => {
    for (const [before, after] of [[1098, 1116], [1004, 989], [15, 0]]) {
      expect(interpolateRating(before, after, 0)).toBe(before);
      expect(interpolateRating(before, after, 1)).toBe(after);
      expect(interpolateRating(before, after, 2)).toBe(after);
    }
    expect(RATING_ANIMATION_DURATION_MS).toBeGreaterThanOrEqual(1_000);
    expect(RATING_ANIMATION_DURATION_MS).toBeLessThanOrEqual(1_200);
  });

  it("keeps settlement private, ranked-only and sourced from the append-only ledger", () => {
    const migration = readFileSync("supabase/migrations/202608310002_multiplayer_ranked_rating_feedback.sql", "utf8");
    const component = readFileSync("src/components/GameResultModal/RatingResultProgress.tsx", "utf8");
    expect(migration).toContain("private.rating_settlements");
    expect(migration).toContain("match_row.mode = 'ranked'");
    expect(migration).toContain("from public, anon, authenticated");
    expect(component).toContain("prefers-reduced-motion: reduce");
    expect(component).not.toContain("settle_ranked_match");
  });
});
