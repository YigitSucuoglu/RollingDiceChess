import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202609010002_profile_statistics_5d_a_multiplayer_telemetry.sql";
const migration = readFileSync(migrationPath, "utf8");
const authority = readFileSync("api/multiplayer.ts", "utf8");

describe("trusted multiplayer telemetry foundation", () => {
  it("keeps telemetry private, match-scoped and separate from career projections", () => {
    expect(migration).toContain("create table private.multiplayer_match_player_telemetry");
    expect(migration).toContain("primary key (match_id, player_id)");
    expect(migration).toContain("create table private.multiplayer_career_telemetry_settlements");
    expect(migration).toContain("match_id uuid primary key");
    expect(migration).toContain("projection_applied_at timestamptz");
    expect(migration).toContain("revoke all on private.multiplayer_match_player_telemetry from public, anon, authenticated");
    expect(migration).not.toContain("update public.player_ratings");
    expect(migration).not.toContain("update public.player_progression");
  });

  it("captures rolls, all six triple types and accepted history moves from trusted revisions", () => {
    for (const piece of ["pawn", "knight", "bishop", "rook", "queen", "king"]) {
      expect(migration).toContain(piece);
    }
    expect(migration).toContain("roulette_rolls = telemetry.roulette_rolls + 1");
    expect(migration).toContain("foreach piece_type in array trusted_roll");
    expect(migration).toContain("triple_rolls_by_piece");
    expect(migration).toContain("historySequence");
    expect(migration).toContain("history_entry ->> 'piece'");
    expect(migration).toContain("new.revision > old.revision");
  });

  it("uses normal turn changes and charged authoritative clock intervals", () => {
    expect(migration).toContain("new.current_turn is distinct from old.current_turn");
    expect(migration).toContain("if moves_used > 0");
    expect(migration).toContain("case when moves_used = 3 then 1 else 0 end");
    expect(migration).toContain("old.active_turn_started_at");
    expect(migration).toContain("least(");
    expect(migration).toContain("play_time_ms = telemetry.play_time_ms + charged_ms");
  });

  it("finalizes only supported terminal outcomes and excludes technical abort", () => {
    for (const reason of ["king-captured", "timeout", "forfeit", "disconnect-forfeit"]) {
      expect(migration).toContain(`'${reason}'`);
    }
    expect(migration).toContain("on conflict (match_id) do nothing");
    expect(migration).toContain("kings_captured = 1");
    const finalizer = migration.slice(
      migration.indexOf("create or replace function private.finalize_multiplayer_career_telemetry"),
      migration.indexOf("create or replace function private.capture_multiplayer_match_telemetry"),
    );
    expect(finalizer).not.toContain("technical-abort");
    expect(migration).toContain("No historical backfill");
  });

  it("does not extend the browser intent contract with telemetry or identity", () => {
    expect(authority).toContain("Object.hasOwn(body, \"playerId\")");
    expect(authority).not.toMatch(/body\.(telemetry|pieceType|rollCount|playTime|threeRights)/);
    expect(authority).not.toContain("trusted_telemetry");
  });
});
