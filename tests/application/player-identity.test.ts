import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveProfileConflictModel } from "../../src/application/players/PlayerMigrationModel";
import {
  CLOUD_PLAYER_SCHEMA_VERSION,
  createGuestDisplayName,
  normalizeAccountDisplayName,
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
    publicDiscriminator: owner === "guest" ? "19F1P" : "7K2M9",
    usernameOnboardingRequired: owner === "account",
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
    expect(() => normalizeAccountDisplayName("Guest1842")).toThrow(/reserved/i);
    expect(() => normalizeAccountDisplayName("gUeSt1842")).toThrow(/reserved/i);
    expect(normalizeAccountDisplayName("Yigit")).toBe("Yigit");
    expect([normalizeAccountDisplayName("Yigit"), normalizeAccountDisplayName("Yigit")])
      .toEqual(["Yigit", "Yigit"]);
  });

  it("uses Google profile by retiring guest without arithmetic merge", () => {
    const guest = profile("P1", "guest", 5000, 1450);
    const google = profile("P2", "account", 1200, 1320);
    const result = resolveProfileConflictModel({ guest, google }, "USE_GOOGLE_PROFILE");
    expect(result.survivingPlayerId).toBe("P2");
    expect(result.guest.lifecycle).toBe("retired");
    expect(result.google.progression.totalXp).toBe(1200);
    expect(result.google.rating.multiplayerRating).toBe(1320);
    expect(result.google.publicDiscriminator).toBe("7K2M9");
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
    expect(result.guest.publicDiscriminator).toBe("19F1P");
    expect(result.guest.usernameOnboardingRequired).toBe(true);
    expect(result.google.lifecycle).toBe("retired");
    expect(() => resolveProfileConflictModel(result, "USE_GOOGLE_PROFILE")).toThrow();
  });

  it("defines server allocated immutable discriminator and reserved Guest rename SQL", () => {
    const sql = readFileSync("supabase/migrations/202608180001_profile_identity_01a_public_identity.sql", "utf8");
    expect(sql).toContain("players_public_discriminator_unique");
    expect(sql).toContain("^[A-Z0-9]{5}$");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("public discriminator is immutable");
    expect(sql).toContain("reserved guest display name");
    expect(sql).toContain("ownership_kind='account'");
    expect(sql).not.toMatch(/update public\.players[^;]+where public_discriminator/is);
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

  it("keeps expired handoffs recoverable only after ownership binding", () => {
    const sql = readFileSync(
      "supabase/migrations/202608180002_profile_identity_01b_hf1_migration_recovery.sql",
      "utf8",
    );
    expect(sql).toContain("intent.expires_at < now() and intent.account_auth_user_id is null");
    expect(sql).toContain("intent.account_auth_user_id <> auth.uid()");
    expect(sql).toContain("auth.uid() <> intent.guest_auth_user_id");
    expect(sql).toContain("migration already resolved differently");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("for update");
    expect(sql).not.toMatch(/update public\.player_(?:progression|ratings)/i);
  });
});
