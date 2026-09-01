import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202609010003_profile_statistics_5d_b_multiplayer_career_projection.sql",
  "utf8",
).toLowerCase();
const verification = readFileSync(
  "supabase/tests/profile_statistics_5d_b_multiplayer_career_projection_verification.sql",
  "utf8",
).toLowerCase();

describe("Phase 5D-B canonical multiplayer career projection", () => {
  it("uses a private PlayerId-scoped typed projection", () => {
    expect(migration).toContain("create table private.player_multiplayer_statistics");
    expect(migration).toContain("player_id uuid primary key");
    expect(migration).toContain("triple_king_rolls bigint");
    expect(migration).not.toContain("create table public.player_multiplayer_statistics");
    expect(migration).not.toContain("auth_user_id");
  });

  it("projects both participants and the marker under a match lock", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(
      /from private\.multiplayer_career_telemetry_settlements candidate[\s\S]+for update/,
    );
    expect(migration).toContain("perform private.add_multiplayer_career_participant(");
    expect(migration).toContain("set projection_applied_at = now()");
  });

  it("keeps streak ranked-only and raw activity mode-independent", () => {
    expect(migration).toContain("settlement.match_mode = 'ranked'");
    expect(migration).toContain("when not ranked_match then statistic.current_ranked_win_streak");
    expect(migration).toContain(
      "total_play_time_ms = statistic.total_play_time_ms + (participant ->> 'playtimems')::bigint",
    );
    expect(migration).toContain(
      "triple_king_rolls = statistic.triple_king_rolls",
    );
  });

  it("is private, retryable, and does not rewrite established competitive counters", () => {
    expect(migration).toContain(
      "revoke all on private.player_multiplayer_statistics from public, anon, authenticated",
    );
    expect(migration).toContain("project_pending_multiplayer_career_settlements");
    expect(migration).not.toContain("update public.player_ratings");
    expect(migration).not.toContain("update private.rating_settlements");
    expect(migration).not.toContain("update private.unranked_match_completions");
  });

  it("preserves explicit survivor semantics without cross-PlayerId merging", () => {
    expect(migration).not.toContain("resolve_profile_conflict");
    expect(migration).not.toContain("superseded_by");
    expect(migration).not.toContain("player_migration_intents");
    expect(migration).not.toMatch(
      /insert into private\.player_multiplayer_statistics\s*\(player_id\)\s*select/,
    );
  });

  it("verifies replay, atomic failure, six-piece counters, and browser denial", () => {
    expect(verification).toContain("ranked_streak_sequence_correct");
    expect(verification).toContain("malformed_participant_rolls_back_both");
    expect(verification).toContain("six_piece_roll_move_projection_correct");
    expect(verification).toContain("six_piece_triple_projection_correct");
    expect(verification).toContain("browser_projection_denied");
    expect(verification).toContain("concurrent_projection_lock_present");
  });
});
