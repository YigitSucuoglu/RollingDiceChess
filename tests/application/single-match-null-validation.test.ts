import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202609010010_achievements_01_phase_4b_2c_2c_null_validation.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/tests/achievements_01_phase_4b_2c_2c_null_validation_verification.sql",
  "utf8",
);

describe("single-match NULL validation migration contract", () => {
  it("changes only the private validator and retains versioned v1 semantics", () => {
    expect(migration).toContain("create or replace function private.validate_singleplayer_match_completion(");
    expect(migration).toContain("single_match->>'schemaVersion' is distinct from '1'");
    expect(migration).toContain("snapshot -> (required.field_name) is null");
    expect(migration).toContain("jsonb_typeof(snapshot -> (required.field_name)) = 'null'");
    expect(migration).toContain("operation->>'winsDelta' is null");
    expect(migration).toContain("operation->>'kingsCapturedDelta' is null");
    expect(migration).not.toMatch(/create or replace function public\./);
    expect(migration).not.toMatch(/\b(?:alter|drop|create)\s+table\b/i);
    expect(migration).not.toMatch(/create (?:or replace )?function private\.evaluate_single_match_achievements/);
  });

  it("guards every required snapshot field without changing optional-key policy", () => {
    for (const field of [
      "matchId", "playerId", "mode", "playerColor", "status", "terminationReason",
      "winner", "valid", "complete", "playerSuccessfulMoves", "botSuccessfulMoves",
      "totalSuccessfulMoves", "promotedPawnIds", "capturedEnemyPieces", "capturedOwnPieces",
      "pawnCaptures", "tripleRouletteResults", "currentConsecutiveThreeRightsTurns",
      "bestConsecutiveThreeRightsTurns", "terminalPlayerTurnMovesUsed", "finalOwnPieceCount",
    ]) {
      expect(migration).toContain(`'${field}'`);
      expect(verification).toContain(`('${field}')`);
    }
    expect(migration).not.toContain("unknownField");
    expect(migration).not.toContain("payload_size");
  });

  it("keeps the database regression isolated and tests both valid outcomes", () => {
    expect(verification.trimStart()).toMatch(/^--[\s\S]*?begin;/);
    expect(verification.trimEnd()).toMatch(/rollback;$/);
    expect(verification).toContain("'valid_king_capture' as case_name");
    expect(verification).toContain("'valid_timeout'");
    expect(verification).toContain("'missing'");
    expect(verification).toContain("'json_null'");
    expect(verification).toContain("(pg_temp.null_validation_base()->'snapshot') - field_name");
    expect(verification).not.toMatch(/\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?(?:auth|public|private)\./i);
  });
});
