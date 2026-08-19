import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { toPlayerId } from "../../src/application/players/PlayerContracts";
import {
  calculateRatingChange,
  RATING_MAX_MOVEMENT,
  RATING_MIN_MOVEMENT,
} from "../../src/domain/rating/RatingCalculator";
import { resolveRatingEligibility } from "../../src/domain/rating/RatingContracts";

const PLAYER_A = toPlayerId("550e8400-e29b-41d4-a716-446655440000");
const PLAYER_B = toPlayerId("550e8400-e29b-41d4-a716-446655440001");

function change(playerARating: number, playerBRating: number, winner: "playerA" | "playerB") {
  return calculateRatingChange({
    playerAId: PLAYER_A,
    playerBId: PLAYER_B,
    playerARating,
    playerBRating,
    winner,
  });
}

describe("authoritative rating calculation", () => {
  it.each([
    [1000, 1000, 15, 15],
    [1025, 1000, 14, 16],
    [1050, 1000, 13, 18],
    [1075, 1000, 11, 19],
    [1100, 1000, 10, 20],
    [1150, 1000, 8, 23],
    [1200, 1000, 5, 25],
    [1500, 1000, 5, 25],
  ])("locks %i vs %i to favorite %i and underdog %i", (
    higher,
    lower,
    favoriteMovement,
    underdogMovement,
  ) => {
    expect(change(higher, lower, "playerA").movement).toBe(favoriteMovement);
    expect(change(higher, lower, "playerB").movement).toBe(underdogMovement);
  });

  it("uses a fresh deterministic movement for a one-point difference", () => {
    expect(change(1001, 1000, "playerA").movement).toBe(15);
    expect(change(1001, 1000, "playerB").movement).toBe(15);
  });

  it("is symmetric when player seats are swapped", () => {
    const winnerA = change(1000, 1100, "playerA");
    const winnerB = change(1100, 1000, "playerB");
    expect(winnerA.movement).toBe(20);
    expect(winnerB.movement).toBe(20);
    expect(winnerA.playerADelta).toBe(winnerB.playerBDelta);
    expect(winnerA.playerBDelta).toBe(winnerB.playerADelta);
  });

  it("keeps normal outcomes zero-sum and inside the 5..25 movement range", () => {
    for (const result of [change(1_000_000, 999_800, "playerA"), change(1_000_000, 999_800, "playerB")]) {
      expect(result.movement).toBeGreaterThanOrEqual(RATING_MIN_MOVEMENT);
      expect(result.movement).toBeLessThanOrEqual(RATING_MAX_MOVEMENT);
      expect(result.playerADelta + result.playerBDelta).toBe(0);
      expect(result.isZeroSum).toBe(true);
    }
  });

  it("applies a hard zero floor and reports the intentional non-zero-sum exception", () => {
    const result = change(1000, 3, "playerA");
    expect(result).toMatchObject({
      movement: 5,
      playerADelta: 5,
      playerBDelta: -3,
      playerBNewRating: 0,
      floorApplied: true,
      isZeroSum: false,
    });
  });

  it.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "rejects invalid rating %s",
    (rating) => expect(() => change(rating, 1000, "playerA")).toThrow(),
  );

  it("rejects identical PlayerIds", () => {
    expect(() => calculateRatingChange({
      playerAId: PLAYER_A,
      playerBId: PLAYER_A,
      playerARating: 1000,
      playerBRating: 1000,
      winner: "playerA",
    })).toThrow(/distinct PlayerIds/);
  });
});

describe("rating eligibility policy", () => {
  const result = {
    matchId: "4ab1c23e-ecf8-4ebd-a689-5c465e517916",
    playerAId: PLAYER_A,
    playerBId: PLAYER_B,
    winner: "playerA" as const,
    terminationReason: "normal" as const,
  };

  it("rates only ranked normal wins and forfeits", () => {
    expect(resolveRatingEligibility({ ...result, mode: "multiplayer-ranked" })).toEqual({
      eligible: true,
      winner: "playerA",
    });
    expect(resolveRatingEligibility({
      ...result,
      mode: "multiplayer-ranked",
      terminationReason: "forfeit",
    })).toEqual({ eligible: true, winner: "playerA" });
  });

  it("never rates bot, unranked or technical-abort outcomes", () => {
    expect(resolveRatingEligibility({ ...result, mode: "bot" })).toEqual({
      eligible: false,
      reason: "bot",
    });
    expect(resolveRatingEligibility({ ...result, mode: "multiplayer-unranked" })).toEqual({
      eligible: false,
      reason: "unranked",
    });
    expect(resolveRatingEligibility({
      ...result,
      mode: "multiplayer-ranked",
      winner: null,
      terminationReason: "technical-abort",
    })).toEqual({ eligible: false, reason: "technical-abort" });
  });

  it("rejects draw-like or contradictory outcomes", () => {
    expect(() => resolveRatingEligibility({
      ...result,
      mode: "multiplayer-ranked",
      winner: null,
    })).toThrow(/requires a winner/);
    expect(() => resolveRatingEligibility({
      ...result,
      mode: "multiplayer-ranked",
      terminationReason: "technical-abort",
    })).toThrow(/cannot declare a winner/);
  });
});

describe("rating persistence boundary", () => {
  const migration = readFileSync(
    "supabase/migrations/202608190001_rating_01_authoritative_rating.sql",
    "utf8",
  );

  it("keeps settlement private, service-only, atomic and idempotent", () => {
    expect(migration).toContain("create table private.rating_settlements");
    expect(migration).toContain("create or replace function private.settle_ranked_match");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(/order by rating\.player_id\s+for update/i);
    expect(migration).toContain("grant execute on function private.settle_ranked_match");
    expect(migration).toContain("to service_role");
    expect(migration).toMatch(/revoke all on function private\.settle_ranked_match[\s\S]+from public, anon, authenticated/i);
    expect(migration).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/i);
  });

  it("preserves the authoritative current-rating table and 1000 default", () => {
    expect(migration).toContain("alter table public.player_ratings");
    expect(migration).toContain("check (multiplayer_rating >= 0)");
    expect(migration).not.toMatch(/create table public\.player_ratings/i);
    expect(migration).not.toMatch(/alter column multiplayer_rating set default/i);
  });
});
