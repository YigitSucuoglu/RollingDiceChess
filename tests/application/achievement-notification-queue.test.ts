import { describe, expect, it } from "vitest";

import { AchievementNotificationQueue } from "../../src/application/achievements/AchievementNotificationQueue";
import type { AchievementCollection } from "../../src/application/achievements/AchievementRead";
import type { AchievementId } from "../../src/domain/achievements/AchievementContracts";

const collection = (...ids: AchievementId[]): AchievementCollection => ({
  catalogVersion: 1, unlockedCount: ids.length,
  unlocks: ids.map((achievementId) => ({ achievementId, unlockedAt: "2026-11-19T00:00:00Z" })),
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("AchievementNotificationQueue", () => {
  it("never celebrates historical unlocks on first load and orders new IDs by catalog", () => {
    const queue = new AchievementNotificationQueue(memoryStorage());
    queue.setOwner("player-a");
    expect(queue.prime("player-a", collection("ranked_victor"))).toBe(true);
    expect(queue.resolveTerminal("player-a", "match-1", collection("ranked_victor"))).toEqual([]);
    expect(queue.resolveTerminal("player-a", "match-2", collection("pawn_commander", "ranked_victor", "rookie_campaign")))
      .toEqual(["rookie_campaign", "pawn_commander"]);
  });

  it("suppresses match replay, refresh replay and cross-owner state", () => {
    const storage = memoryStorage();
    const first = new AchievementNotificationQueue(storage);
    first.setOwner("player-a");
    first.prime("player-a", collection());
    expect(first.resolveTerminal("player-a", "match-1", collection("ranked_victor"))).toEqual(["ranked_victor"]);
    expect(first.resolveTerminal("player-a", "match-1", collection("ranked_victor"))).toEqual([]);
    const refreshed = new AchievementNotificationQueue(storage);
    refreshed.setOwner("player-a");
    refreshed.prime("player-a", collection());
    expect(refreshed.resolveTerminal("player-a", "match-1", collection("ranked_victor"))).toEqual([]);
    refreshed.setOwner("player-b");
    expect(refreshed.resolveTerminal("player-a", "match-2", collection("pawn_commander"))).toEqual([]);
    refreshed.prime("player-b", collection());
    expect(refreshed.resolveTerminal("player-b", "match-3", collection("pawn_commander"))).toEqual(["pawn_commander"]);
  });

  it("suppresses notifications if durable dedup storage is unavailable", () => {
    const queue = new AchievementNotificationQueue({
      getItem: () => null,
      setItem: () => { throw new Error("storage denied"); },
    });
    queue.setOwner("player-a");
    queue.prime("player-a", collection());
    expect(queue.resolveTerminal("player-a", "match-1", collection("ranked_victor"))).toEqual([]);
  });
});
