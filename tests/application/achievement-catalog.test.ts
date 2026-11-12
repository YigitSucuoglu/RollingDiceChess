import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_DEFINITIONS,
  getAchievementPresentation,
  getAchievementsForFilter,
} from "../../src/domain/achievements/AchievementCatalog";
import { ACHIEVEMENT_CATALOG_VERSION } from "../../src/domain/achievements/AchievementContracts";

describe("achievement catalog", () => {
  it("defines the locked 30-item catalog with 22 career and 8 single-match entries", () => {
    expect(ACHIEVEMENT_CATALOG).toHaveLength(30);
    expect(ACHIEVEMENT_CATALOG.filter((item) => item.category !== "single-match")).toHaveLength(22);
    expect(ACHIEVEMENT_CATALOG.filter((item) => item.category === "single-match")).toHaveLength(8);
    expect(new Set(ACHIEVEMENT_CATALOG.map((item) => item.id))).toHaveProperty("size", 30);
  });

  it("locks category counts, thresholds, badge-only rewards and catalog version", () => {
    expect(Object.fromEntries([
      "singleplayer-career", "ranked-multiplayer", "global-roulette",
      "global-piece-mastery", "singleplayer-progression", "single-match",
    ].map((category) => [
      category,
      ACHIEVEMENT_CATALOG.filter((item) => item.category === category).length,
    ]))).toEqual({
      "singleplayer-career": 6,
      "ranked-multiplayer": 6,
      "global-roulette": 6,
      "global-piece-mastery": 3,
      "singleplayer-progression": 1,
      "single-match": 8,
    });

    expect(Object.fromEntries(ACHIEVEMENT_CATALOG.map((item) => [item.id, item.target]))).toEqual({
      rookie_campaign: 10, hundred_games: 100, dedicated_player: 500,
      king_hunter: 10, capture_hundred_kings: 100, winning_run: 3,
      ranked_victor: 1, ranked_regular: 25, ranked_veteran: 100,
      winning_streak: 5, rating_climber: 1200, elite_player: 1500,
      wheel_spinner: 100, roulette_master: 1000, roll_collector: 5000,
      triple_crown: 6, triple_collector: 100, full_rights: 25,
      pawn_commander: 500, knight_specialist: 250, royal_maneuvers: 100,
      roulette_legend: 50,
      the_long_march: 75, royal_ascension: 3, last_one_standing: 12,
      wheels_favor: 4, against_all_odds: 3, untouchable: 0,
      pawn_rebellion: 8, perfect_rhythm: 10,
    });
    expect(ACHIEVEMENT_CATALOG.every((item) =>
      item.reward === "badge" && item.catalogVersion === ACHIEVEMENT_CATALOG_VERSION)).toBe(true);
  });

  it("keeps deterministic order, complete EN/TR text and stable lookup", () => {
    expect(ACHIEVEMENT_CATALOG.map((item) => item.order)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
    expect(ACHIEVEMENT_CATALOG.every((item) =>
      item.title.en.length > 0 && item.title.tr.length > 0
      && item.description.en.length > 0 && item.description.tr.length > 0)).toBe(true);
    for (const item of ACHIEVEMENT_CATALOG) expect(ACHIEVEMENT_DEFINITIONS[item.id]).toBe(item);
  });

  it("partially hides exactly eight single-match definitions until unlocked", () => {
    const hidden = ACHIEVEMENT_CATALOG.filter((item) => item.visibility === "partially-hidden");
    expect(hidden).toHaveLength(8);
    expect(hidden.every((item) => item.category === "single-match" && item.hint?.en && item.hint.tr)).toBe(true);
    expect(ACHIEVEMENT_CATALOG.filter((item) => item.visibility === "public")).toHaveLength(22);

    const locked = getAchievementPresentation(ACHIEVEMENT_DEFINITIONS.untouchable, false);
    expect(locked).toMatchObject({ locked: true, displayProgress: false });
    expect(locked.hint?.en).toBe("Victory without sacrifice.");
    expect(locked).not.toHaveProperty("description");
    expect(locked).not.toHaveProperty("target");

    const unlocked = getAchievementPresentation(ACHIEVEMENT_DEFINITIONS.untouchable, true);
    expect(unlocked).toMatchObject({ locked: false, displayProgress: true, target: 0 });
    expect(unlocked.description?.en).toMatch(/without losing/i);
    expect(unlocked).not.toHaveProperty("hint");
  });

  it("maps UI filters without changing catalog order", () => {
    expect(getAchievementsForFilter("all")).toBe(ACHIEVEMENT_CATALOG);
    expect(getAchievementsForFilter("singleplayer")).toHaveLength(6);
    expect(getAchievementsForFilter("ranked")).toHaveLength(6);
    expect(getAchievementsForFilter("roulette")).toHaveLength(6);
    expect(getAchievementsForFilter("piece-mastery")).toHaveLength(3);
    expect(getAchievementsForFilter("progression")).toHaveLength(1);
    expect(getAchievementsForFilter("single-match")).toHaveLength(8);
  });
});
