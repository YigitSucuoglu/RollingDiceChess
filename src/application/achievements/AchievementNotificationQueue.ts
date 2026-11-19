import { ACHIEVEMENT_CATALOG } from "../../domain/achievements/AchievementCatalog";
import type { AchievementId } from "../../domain/achievements/AchievementContracts";
import type { AchievementCollection } from "./AchievementRead";

const STORAGE_KEY = "roulettechess.achievement-notifications.v1";

interface NotificationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class AchievementNotificationQueue {
  private owner: string | null = null;
  private baseline: ReadonlySet<AchievementId> | null = null;
  private readonly processedMatches = new Set<string>();
  private readonly storage: NotificationStorage;

  public constructor(storage: NotificationStorage) { this.storage = storage; }

  public setOwner(owner: string | null): void {
    if (owner === this.owner) return;
    this.owner = owner;
    this.baseline = null;
    this.processedMatches.clear();
  }

  public prime(owner: string, collection: AchievementCollection): boolean {
    if (owner !== this.owner || this.baseline) return false;
    this.baseline = new Set(collection.unlocks.map((unlock) => unlock.achievementId));
    return true;
  }

  public resolveTerminal(owner: string, matchId: string, collection: AchievementCollection): readonly AchievementId[] {
    if (!this.baseline || owner !== this.owner || !matchId || this.processedMatches.has(matchId)) return [];
    this.processedMatches.add(matchId);
    const current = new Set(collection.unlocks.map((unlock) => unlock.achievementId));
    const newlyUnlocked = ACHIEVEMENT_CATALOG.filter((item) => current.has(item.id) && !this.baseline!.has(item.id));
    this.baseline = current;
    let seen: string[];
    try {
      const stored = this.storage.getItem(STORAGE_KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) return [];
      seen = parsed;
    } catch { return []; }
    const result: AchievementId[] = [];
    for (const achievement of newlyUnlocked) {
      const key = `${owner}:${achievement.id}`;
      if (seen.includes(key)) continue;
      seen = [...seen, key];
      try { this.storage.setItem(STORAGE_KEY, JSON.stringify(seen)); }
      catch { return result; }
      result.push(achievement.id);
    }
    return result;
  }
}
