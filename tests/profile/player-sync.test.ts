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
import { AUTH_SESSION_SCHEMA_VERSION, toAccountId, toGuestSessionId } from "../../src/application/auth/AuthenticationContracts";

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

function accountSession() {
  return { schemaVersion: AUTH_SESSION_SCHEMA_VERSION, state: {
    status: "authenticated" as const,
    account: { accountId: toAccountId("account-1"), provider: "google" as const },
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
      renameCurrentPlayer: vi.fn(),
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
      bootstrap: vi.fn(), applyOperation: vi.fn(), renameCurrentPlayer: vi.fn(),
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
      renameCurrentPlayer: vi.fn(),
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

  it("flushes every pending operation before account migration and resets only after empty", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const canonical = cloud();
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => canonical), bootstrap: vi.fn(),
      applyOperation: vi.fn(async () => canonical),
      renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(cloudGuest());
    const before = repository.getProfile();
    const after = structuredClone(before);
    after.totalXp += 50;
    after.statistics.gamesPlayed++;
    after.statistics.wins++;
    sync.recordCompletedMatch(before, after);
    expect(await sync.prepareForAccountMigration()).toBe(true);
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!).pending).toHaveLength(0);
    sync.suspendForAccountMigration();
    await sync.adoptCanonicalAfterAccountMigration(canonical.playerId);
    expect(sync.isCloudCanonical()).toBe(true);
  });

  for (const scenario of [
    { name: "Keep Google", survivorId: "google-b", survivorXp: 70, discriminator: "7K2M9" },
    { name: "Keep Guest", survivorId: "guest-a", survivorXp: 50, discriminator: "19F1P" },
  ]) {
    it(`adopts the ${scenario.name} survivor before the next progression operation`, async () => {
      const localStorage = storage();
      const repository = new LocalStoragePlayerProfileRepository(localStorage);
      const guest = meaningful(createDefaultPlayerProfile());
      guest.playerId = "guest-a";
      guest.totalXp = 50;
      repository.saveProfile(guest);
      localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
        schemaVersion: 1,
        cloudPlayerId: "guest-a",
        bootstrapSourceProfileId: guest.playerId,
        pending: [],
        conflict: false,
      }));
      let active = cloud(structuredClone(guest));
      active = { ...active, playerId: "guest-a" };
      const appliedTo: string[] = [];
      const remote: CloudPlayerSyncPort = {
        loadCurrent: vi.fn(async () => structuredClone(active)),
        bootstrap: vi.fn(),
        applyOperation: vi.fn(async (operation) => {
          appliedTo.push(active.playerId);
          const next = structuredClone(active);
          next.profile.totalXp += Number(operation.payload.xpDelta);
          active = next;
          return structuredClone(active);
        }),
        renameCurrentPlayer: vi.fn(),
      };
      const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
      await sync.handleAuthentication(cloudGuest());
      expect(await sync.prepareForAccountMigration()).toBe(true);
      sync.suspendForAccountMigration();

      const survivor = meaningful(createDefaultPlayerProfile());
      survivor.playerId = scenario.survivorId;
      survivor.displayName = scenario.name === "Keep Google" ? "Player" : "Guest1234";
      survivor.totalXp = scenario.survivorXp;
      survivor.publicDiscriminator = scenario.discriminator;
      survivor.usernameOnboardingRequired = scenario.name === "Keep Guest";
      active = { ...cloud(survivor), playerId: scenario.survivorId };
      await sync.adoptCanonicalAfterAccountMigration(scenario.survivorId);

      expect(repository.getProfile().playerId).toBe(scenario.survivorId);
      expect(repository.getProfile().totalXp).toBe(scenario.survivorXp);
      expect(repository.getProfile().publicDiscriminator).toBe(scenario.discriminator);
      const before = repository.getProfile();
      const after = structuredClone(before);
      after.totalXp += 25;
      after.statistics.gamesPlayed++;
      after.statistics.wins++;
      sync.recordCompletedMatch(before, after);
      await vi.waitFor(() => expect(remote.applyOperation).toHaveBeenCalledOnce());
      expect(appliedTo).toEqual([scenario.survivorId]);
      expect(repository.getProfile().totalXp).toBe(scenario.survivorXp + 25);

      const refreshedRepository = new LocalStoragePlayerProfileRepository(localStorage);
      const refreshed = new PlayerSyncCoordinator(refreshedRepository, remote, localStorage);
      await refreshed.handleAuthentication(cloudGuest());
      expect(refreshedRepository.getProfile().playerId).toBe(scenario.survivorId);
      expect(refreshedRepository.getProfile().totalXp).toBe(scenario.survivorXp + 25);
      expect(refreshedRepository.getProfile().publicDiscriminator).toBe(scenario.discriminator);
    });
  }

  it("does not queue progression while account ownership is unresolved", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => cloud()), bootstrap: vi.fn(), applyOperation: vi.fn(),
      renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(cloudGuest());
    sync.suspendForAccountMigration();
    const before = repository.getProfile();
    const after = structuredClone(before);
    after.totalXp += 25;
    after.statistics.gamesPlayed++;
    after.statistics.wins++;
    sync.recordCompletedMatch(before, after);
    expect(remote.applyOperation).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!).pending).toHaveLength(0);
  });

  it("adopts an atomic username update without changing identity or progression", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const profile = meaningful(createDefaultPlayerProfile());
    profile.playerId = "account-player";
    profile.displayName = "Guest1842";
    profile.publicDiscriminator = "19F1P";
    profile.usernameOnboardingRequired = true;
    const initial = { ...cloud(profile), playerId: profile.playerId };
    const renamed = structuredClone(initial);
    renamed.profile.displayName = "RouletteKing";
    renamed.profile.usernameOnboardingRequired = false;
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => structuredClone(initial)),
      bootstrap: vi.fn(),
      applyOperation: vi.fn(),
      renameCurrentPlayer: vi.fn(async () => structuredClone(renamed)),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(accountSession());
    const before = repository.getProfile();
    await sync.renameCurrentPlayer("RouletteKing");
    const after = repository.getProfile();
    expect(remote.renameCurrentPlayer).toHaveBeenCalledWith("RouletteKing");
    expect(after.displayName).toBe("RouletteKing");
    expect(after.usernameOnboardingRequired).toBe(false);
    expect(after.playerId).toBe(before.playerId);
    expect(after.publicDiscriminator).toBe(before.publicDiscriminator);
    expect(after.totalXp).toBe(before.totalXp);
    expect(after.statistics).toEqual(before.statistics);
  });

  it("rejects a Guest rename before calling the remote boundary", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const profile = createDefaultPlayerProfile();
    profile.playerId = "guest-player";
    const canonical = { ...cloud(profile), playerId: profile.playerId };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => canonical),
      bootstrap: vi.fn(),
      applyOperation: vi.fn(),
      renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(cloudGuest());
    await expect(sync.renameCurrentPlayer("Yigit")).rejects.toThrow(/unavailable/i);
    expect(remote.renameCurrentPlayer).not.toHaveBeenCalled();
  });
});
