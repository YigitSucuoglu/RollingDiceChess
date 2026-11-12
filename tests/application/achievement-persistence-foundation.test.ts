import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contracts = readFileSync(
  "src/domain/achievements/AchievementContracts.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/202609010005_achievements_01_phase_3b_2a_foundation.sql",
  "utf8",
);
const lowerMigration = migration.toLowerCase();

function quotedValues(source: string): readonly string[] {
  return [...source.matchAll(/['"]([a-z][a-z0-9_-]+)['"]/g)]
    .map((match) => match[1]);
}

function achievementContractIds(): readonly string[] {
  const union = contracts.match(
    /export type AchievementId\s*=([\s\S]*?)export type AchievementCategory/,
  )?.[1];
  if (!union) throw new Error("AchievementId union was not found.");
  return quotedValues(union);
}

function migrationAchievementIds(): readonly string[] {
  const constraint = migration.match(
    /player_achievement_unlocks_achievement_id_check[\s\S]*?achievement_id in \(([\s\S]*?)\)\),/i,
  )?.[1];
  if (!constraint) throw new Error("Achievement ID constraint was not found.");
  return quotedValues(constraint);
}

describe("ACHIEVEMENTS-01 Phase 3B-2A persistence foundation", () => {
  it("keeps all 30 immutable TypeScript and SQL catalog IDs in exact sync", () => {
    const domainIds = achievementContractIds();
    const databaseIds = migrationAchievementIds();
    expect(domainIds).toHaveLength(30);
    expect(new Set(domainIds).size).toBe(30);
    expect(databaseIds).toEqual(domainIds);
  });

  it("keeps catalog version one aligned across domain, storage, and read contract", () => {
    expect(contracts).toMatch(/ACHIEVEMENT_CATALOG_VERSION\s*=\s*1\s+as const/);
    expect(lowerMigration).toContain("catalog_version integer not null");
    expect(lowerMigration).toContain("catalog_version >= 1");
    expect(lowerMigration).toContain("'catalogversion',1");
  });

  it("uses a private composite-key table without source uniqueness", () => {
    expect(lowerMigration).toContain("create table private.player_achievement_unlocks");
    expect(lowerMigration).toContain("primary key (player_id, achievement_id)");
    expect(lowerMigration).toContain("references public.players(player_id) on delete cascade");
    expect(lowerMigration).toContain("player_achievement_unlocks_source_lookup");
    expect(lowerMigration).not.toMatch(/unique\s*\(\s*source_type\s*,\s*source_id\s*\)/);
  });

  it("keeps browser roles away from the table and write helper", () => {
    const helperGrant = lowerMigration.match(
      /grant execute on function private\.persist_player_achievement_unlock[\s\S]*?;/,
    )?.[0] ?? "";
    expect(lowerMigration).toContain(
      "revoke all on private.player_achievement_unlocks from public, anon, authenticated",
    );
    expect(lowerMigration).toContain(
      "revoke all on function private.persist_player_achievement_unlock(uuid,text,text,uuid,integer)",
    );
    expect(helperGrant).toContain("to service_role");
    expect(helperGrant).not.toContain("to authenticated");
  });

  it("exposes only a current-active-player minimal read contract", () => {
    const readFunction = lowerMigration.match(
      /create or replace function public\.get_current_player_achievements\(\)[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
    expect(readFunction).toContain("private.current_player_id()");
    expect(readFunction).toContain("player.lifecycle='active'");
    expect(readFunction).toContain("'catalogversion',1");
    expect(readFunction).toContain("'unlockedcount',count(*)::integer");
    expect(readFunction).toContain("'achievementid',unlock.achievement_id");
    expect(readFunction).toContain("'unlockedat',unlock.unlocked_at");
    expect(readFunction).toContain("order by unlock.unlocked_at,unlock.achievement_id");
    expect(readFunction).not.toMatch(/description|hint|'target'|player_auth_owners/);
  });

  it("preserves first-write metadata through an idempotent insert", () => {
    expect(lowerMigration).toContain(
      "on conflict (player_id,achievement_id) do nothing",
    );
    expect(lowerMigration).not.toContain("do update");
    expect(lowerMigration).toContain("catalog_version >= 1");
    expect(lowerMigration).toContain(
      "'singleplayer-operation','multiplayer-settlement','retroactive-career'",
    );
  });
});
