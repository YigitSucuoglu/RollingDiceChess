import { describe, expect, it } from "vitest";
import { AchievementReadService, parseAchievementCollection } from "../../src/application/achievements/AchievementRead";
import { SupabaseAchievementReadAdapter } from "../../src/infrastructure/achievements/SupabaseAchievementReadAdapter";

const valid = { catalogVersion: 1, unlockedCount: 1, unlocks: [
  { achievementId: "rookie_campaign", unlockedAt: "2026-11-17T12:00:00+00:00" },
] };

describe("achievement read boundary", () => {
  it("maps a canonical response and keeps the server unlock timestamp", () => {
    expect(parseAchievementCollection(valid).unlocks[0].unlockedAt).toBe(valid.unlocks[0].unlockedAt);
  });

  it("rejects version mismatch, unknown IDs, duplicates and inconsistent counts", () => {
    expect(() => parseAchievementCollection({ ...valid, catalogVersion: 2 })).toThrow("catalog-mismatch");
    expect(() => parseAchievementCollection({ ...valid, unlocks: [{ ...valid.unlocks[0], achievementId: "unknown" }] })).toThrow("invalid-response");
    expect(() => parseAchievementCollection({ ...valid, unlocks: [...valid.unlocks, ...valid.unlocks] })).toThrow("invalid-response");
    expect(() => parseAchievementCollection({ ...valid, unlockedCount: 2 })).toThrow("invalid-response");
  });

  it("calls only the authenticated current-player read RPC", async () => {
    const names: string[] = [];
    const adapter = new SupabaseAchievementReadAdapter({ rpc(name) {
      names.push(name);
      return Promise.resolve({ data: valid, error: null });
    } });
    expect((await adapter.fetchCurrent()).unlockedCount).toBe(1);
    expect(names).toEqual(["get_current_player_achievements"]);
  });

  it("isolates old-owner responses and supports empty, failure and retry states", async () => {
    let resolveFirst!: (value: typeof valid) => void;
    let calls = 0;
    const service = new AchievementReadService({ fetchCurrent() {
      calls += 1;
      if (calls === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      if (calls === 2) return Promise.resolve({ ...valid, unlockedCount: 0, unlocks: [] });
      if (calls === 3) return Promise.reject(new Error("network"));
      return Promise.resolve(valid);
    } });
    service.setOwner("account:A");
    const pending = service.load();
    service.setOwner(null);
    service.setOwner("account:B");
    resolveFirst(valid);
    await pending;
    expect(service.getState().status).toBe("idle");
    await service.load();
    expect(service.getState().status).toBe("empty");
    await service.load();
    expect(service.getState().status).toBe("error");
    await service.retry();
    expect(service.getState().status).toBe("success");
    service.setOwner(null, true);
    await service.load();
    expect(service.getState().status).toBe("local-only");
    expect(calls).toBe(4);
  });
});
