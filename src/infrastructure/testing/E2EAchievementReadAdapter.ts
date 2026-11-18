import { ACHIEVEMENT_CATALOG_VERSION } from "../../domain/achievements/AchievementContracts";
import { AchievementReadError, type AchievementCollection, type AchievementReadPort } from "../../application/achievements/AchievementRead";

const FIXTURE_KEY = "roulettechess.e2e-achievement-fixture.v1";
const REQUEST_COUNT_KEY = "roulettechess.e2e-achievement-request-count.v1";

export class E2EAchievementReadAdapter implements AchievementReadPort {
  public async fetchCurrent(): Promise<AchievementCollection> {
    const count = Number(window.localStorage.getItem(REQUEST_COUNT_KEY) ?? "0") + 1;
    window.localStorage.setItem(REQUEST_COUNT_KEY, String(count));
    const fixture = window.localStorage.getItem(FIXTURE_KEY);
    if (fixture === "error" || (fixture === "retry" && count === 1)) throw new AchievementReadError("unavailable");
    if (fixture === "mismatch") throw new AchievementReadError("catalog-mismatch");
    if (fixture === "unlocked") return {
      catalogVersion: ACHIEVEMENT_CATALOG_VERSION,
      unlockedCount: 2,
      unlocks: [
        { achievementId: "rookie_campaign", unlockedAt: "2026-11-17T12:00:00+00:00" },
        { achievementId: "untouchable", unlockedAt: "2026-11-17T13:00:00+00:00" },
      ],
    };
    return { catalogVersion: ACHIEVEMENT_CATALOG_VERSION, unlockedCount: 0, unlocks: [] };
  }
}
