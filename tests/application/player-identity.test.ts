import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveProfileConflictModel } from "../../src/application/players/PlayerMigrationModel";
import {
  CLOUD_PLAYER_SCHEMA_VERSION,
  createGuestDisplayName,
  normalizeDisplayName,
  toPlayerId,
  type CloudPlayerProfile,
} from "../../src/application/players/PlayerContracts";
import { toAccountId } from "../../src/application/auth/AuthenticationContracts";

function profile(id: string, owner: "guest" | "account", xp: number, rating: number): CloudPlayerProfile {
  return {
    schemaVersion: CLOUD_PLAYER_SCHEMA_VERSION,
    playerId: toPlayerId(id),
    displayName: owner === "guest" ? "Guest0123" : "Google Player",
    ownership: owner === "guest" ? { kind: "guest" } : { kind: "account", accountId: toAccountId("account-1") },
    lifecycle: "active",
    progression: { totalXp: xp, gamesPlayed: 4, wins: 2, losses: 2 },
    rating: { multiplayerRating: rating, ratedGames: 8, ratingVersion: 1 },
  };
}

describe("cloud player identity model", () => {
  it("keeps PlayerId independent from display name and AccountId", () => {
    const player = profile("player-1", "account", 100, 1000);
    expect(player.playerId).toBe("player-1");
    expect(player.ownership).toEqual({ kind: "account", accountId: "account-1" });
    expect({ ...player, displayName: normalizeDisplayName("  New   Name ") }).toMatchObject({
      playerId: "player-1", displayName: "New Name",
    });
  });

  it("validates non-unique names and creates deterministic Guest#### defaults", () => {
    expect(createGuestDisplayName(0.0123)).toBe("Guest0123");
    expect(normalizeDisplayName("Guest0123")).toBe("Guest0123");
    expect(() => normalizeDisplayName(" ")).toThrow();
    expect(() => normalizeDisplayName("<script>")).toThrow();
  });

  it("uses Google profile by retiring guest without arithmetic merge", () => {
    const guest = profile("P1", "guest", 5000, 1450);
    const google = profile("P2", "account", 1200, 1320);
    const result = resolveProfileConflictModel({ guest, google }, "USE_GOOGLE_PROFILE");
    expect(result.survivingPlayerId).toBe("P2");
    expect(result.guest.lifecycle).toBe("retired");
    expect(result.google.progression.totalXp).toBe(1200);
    expect(result.google.rating.multiplayerRating).toBe(1320);
    expect(resolveProfileConflictModel(result, "USE_GOOGLE_PROFILE")).toBe(result);
  });

  it("uses Guest profile by moving account ownership and retiring Google profile", () => {
    const result = resolveProfileConflictModel({
      guest: profile("P1", "guest", 5000, 1450),
      google: profile("P2", "account", 1200, 1320),
    }, "USE_GUEST_PROFILE");
    expect(result.survivingPlayerId).toBe("P1");
    expect(result.guest.ownership.kind).toBe("account");
    expect(result.guest.progression.totalXp).toBe(5000);
    expect(result.guest.rating.multiplayerRating).toBe(1450);
    expect(result.google.lifecycle).toBe("retired");
    expect(() => resolveProfileConflictModel(result, "USE_GOOGLE_PROFILE")).toThrow();
  });

  it("keeps rating outside browser-writable SQL policy paths", () => {
    const sql = readFileSync("supabase/migrations/202608130001_auth_01c_player_identity.sql", "utf8");
    expect(sql.trimStart()).toMatch(/^--[\s\S]*?begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).toContain("multiplayer_rating integer not null default 1000");
    expect(sql).toContain("alter table public.player_ratings enable row level security");
    expect(sql).not.toMatch(/create policy[^;]+player_ratings[^;]+for update/is);
    expect(sql).toContain("revoke all on all tables in schema public from anon, authenticated");
    expect(sql).toContain("resolve_profile_conflict");
    expect(sql).toContain("for update");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("roulettechess_on_auth_user_created");
    expect(sql).toContain("for existing_auth_user in select id, is_anonymous from auth.users");
    expect(sql).toContain("bootstrap_local_profile(source_profile jsonb)");
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)[^;]+to authenticated/is);
    expect(readFileSync("supabase/tests/data_01a_schema_verification.sql", "utf8"))
      .toContain("Browser role has a forbidden direct mutation grant");
  });
});
