import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202609010001_profile_multiplayer_statistics.sql", "utf8");

describe("canonical Profile multiplayer statistics", () => {
  it("keeps visibility and match mode orthogonal", () => {
    const foundation = readFileSync("supabase/migrations/202608190002_multiplayer_01a_foundation.sql", "utf8");
    expect(foundation).toContain("visibility public.multiplayer_lobby_visibility");
    expect(foundation).toContain("mode public.multiplayer_mode");
    expect(foundation).not.toContain("visibility = 'private' and mode");
    expect(foundation).not.toContain("visibility = 'public' and mode");
  });

  it("uses a private match-id ledger and server terminal boundary for exactly once activity", () => {
    expect(migration).toContain("create table private.unranked_match_completions");
    expect(migration).toContain("match_id uuid primary key");
    expect(migration).toContain("on conflict (match_id) do nothing");
    expect(migration).toContain("private.record_unranked_match_completion(match_row)");
    expect(migration).toContain("match_row.status <> 'terminal'");
    expect(migration).toContain("'disconnect-forfeit'");
    expect(migration).not.toContain("unranked_wins");
    expect(migration).not.toContain("unranked_losses");
  });

  it("keeps ranked projection and browser mutation boundaries intact", () => {
    expect(migration).toContain("private.settle_ranked_match(");
    expect(migration).toContain("revoke all on private.unranked_match_completions from public, anon, authenticated");
    expect(migration).not.toContain("create or replace function public.get_ranked_leaderboard_top_100");
    expect(migration).not.toContain("create or replace function public.get_current_player_ranked_rank");
  });

  it("exposes the Phase 5B DTO without PlayerId or ledger details", () => {
    const sync = readFileSync("src/profile/PlayerSync.ts", "utf8");
    const adapter = readFileSync("src/infrastructure/player/SupabaseCloudPlayerSync.ts", "utf8");
    for (const field of ["rating", "rankedGames", "rankedWins", "rankedLosses", "rankedWinRate", "unrankedGames"]) {
      expect(sync).toContain(`readonly ${field}: number`);
      expect(adapter).toContain(`${field}:`);
    }
    expect(adapter).not.toContain("unranked_match_completions");
  });
});
