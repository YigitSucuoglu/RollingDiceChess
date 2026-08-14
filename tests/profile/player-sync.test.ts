import { describe, expect, it, vi } from "vitest";

import { LocalStoragePlayerProfileRepository } from "../../src/profile/LocalStoragePlayerProfileRepository";
import { createDefaultPlayerProfile, type PlayerProfile } from "../../src/profile/PlayerProfile";
import {
  PLAYER_SYNC_STORAGE_KEY,
  PlayerSyncCoordinator,
  createProgressionOperation,
  type CloudPlayerSyncPort,
  type CloudProfileSnapshot,
} from "../../src/profile/PlayerSync";
import { toGuestSessionId } from "../../src/application/auth/AuthenticationContracts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function meaningful(profile: PlayerProfile): PlayerProfile {
  profile.totalXp = 100;
  profile.statistics.gamesPlayed = 1;
  profile.statistics.wins = 1;
  return profile;
}

function cloud(profile = createDefaultPlayerProfile()): CloudProfileSnapshot {
  return { bootstrapApplied: false, playerId: "cloud-player", profile, multiplayerRating: 1000 };
}

function cloudGuest() {
  return { schemaVersion: 1 as const, state: {
    status: "guest" as const, guestSessionId: toGuestSessionId("guest-cloud"), persistence: "cloud" as const,
  } };
}

describe("PlayerSyncCoordinator", () => {
  it("bootstraps a meaningful legacy profile once when cloud is empty", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    repository.saveProfile(meaningful(repository.getProfile()));
    const canonical = cloud(meaningful(createDefaultPlayerProfile()));
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn().mockResolvedValueOnce(cloud()).mockResolvedValue(canonical),
      bootstrap: vi.fn(async () => canonical),
      applyOperation: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(cloudGuest());
    await sync.handleAuthentication(cloudGuest());
    expect(remote.bootstrap).toHaveBeenCalledOnce();
    expect(sync.isCloudCanonical()).toBe(true);
    expect(repository.getProfile().playerId).toBe(canonical.profile.playerId);
  });

  it("preserves both meaningful profiles and reports an unresolved conflict", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    repository.saveProfile(meaningful(repository.getProfile()));
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => cloud(meaningful(createDefaultPlayerProfile()))),
      bootstrap: vi.fn(), applyOperation: vi.fn(),
    };
    const before = repository.getProfile().totalXp;
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(cloudGuest());
    expect(sync.hasConflict()).toBe(true);
    expect(remote.bootstrap).not.toHaveBeenCalled();
    expect(repository.getProfile().totalXp).toBe(before);
  });

  it("keeps a failed operation pending and removes it after a successful replay", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const canonical = cloud();
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => canonical), bootstrap: vi.fn(),
      applyOperation: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(canonical),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(cloudGuest());
    const before = repository.getProfile();
    const after = structuredClone(before);
    after.totalXp += 50;
    after.statistics.gamesPlayed++;
    after.statistics.wins++;
    sync.recordCompletedMatch(before, after);
    await vi.waitFor(() => expect(remote.applyOperation).toHaveBeenCalledOnce());
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!).pending).toHaveLength(1);
    await sync.reconnect();
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!).pending).toHaveLength(0);
  });

  it("creates progression-only operations without rating or identity fields", () => {
    const before = createDefaultPlayerProfile();
    const after = structuredClone(before);
    after.totalXp = 75;
    after.statistics.gamesPlayed = 1;
    after.statistics.losses = 1;
    const operation = createProgressionOperation(before, after, "operation-1");
    expect(operation?.payload).toMatchObject({ xpDelta: 75, gamesDelta: 1, lossesDelta: 1 });
    expect(JSON.stringify(operation)).not.toMatch(/rating|playerId|account|token/i);
  });
});
