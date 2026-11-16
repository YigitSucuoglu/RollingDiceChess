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
  return { bootstrapApplied: false, playerId: "cloud-player", profile, multiplayerRating: 1000,
    multiplayerStatistics: { rating: 1000, rankedGames: 0, rankedWins: 0,
      rankedLosses: 0, rankedWinRate: 0, unrankedGames: 0 } };
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

function accountSessionFor(accountId: string) {
  return { schemaVersion: AUTH_SESSION_SCHEMA_VERSION, state: {
    status: "authenticated" as const,
    account: { accountId: toAccountId(accountId), provider: "google" as const },
  } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function canonicalFor(playerId: string, totalXp = 0): CloudProfileSnapshot {
  const profile = createDefaultPlayerProfile();
  profile.playerId = playerId;
  profile.totalXp = totalXp;
  return { ...cloud(profile), playerId };
}

describe("PlayerSyncCoordinator", () => {
  it("exposes only the latest canonical server-backed multiplayer rating", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const canonical = { ...cloud(), multiplayerRating: 1376 };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => canonical),
      bootstrap: vi.fn(), applyOperation: vi.fn(), renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    expect(sync.getCanonicalMultiplayerRating()).toBeNull();
    await sync.handleAuthentication(cloudGuest());
    expect(sync.getCanonicalMultiplayerRating()).toBe(1376);
    expect(sync.getCanonicalMultiplayerStatistics()).toEqual(canonical.multiplayerStatistics);
  });

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

  it("adopts a fresh authenticated canonical profile without bootstrapping stale local progression", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const stale = meaningful(repository.getProfile());
    stale.playerId = "deleted-player-a";
    stale.totalXp = 208;
    stale.statistics.gamesPlayed = 3;
    repository.saveProfile(stale);
    localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      cloudPlayerId: "deleted-player-a",
      bootstrapSourceProfileId: "deleted-player-a",
      pending: [],
      conflict: false,
    }));
    const fresh = createDefaultPlayerProfile();
    fresh.playerId = "new-player-b";
    fresh.displayName = "Yigit";
    fresh.publicDiscriminator = "9Z7VG";
    fresh.usernameOnboardingRequired = true;
    const canonical = { ...cloud(fresh), playerId: fresh.playerId };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => structuredClone(canonical)),
      bootstrap: vi.fn(), applyOperation: vi.fn(), renameCurrentPlayer: vi.fn(),
    };

    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(accountSession());

    expect(remote.bootstrap).not.toHaveBeenCalled();
    expect(sync.getCanonicalProfileStatus()).toBe("ready");
    expect(repository.getProfile()).toMatchObject({
      playerId: "new-player-b",
      publicDiscriminator: "9Z7VG",
      totalXp: 0,
      statistics: { gamesPlayed: 0 },
    });
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!)).toMatchObject({
      cloudPlayerId: "new-player-b",
      bootstrapSourceProfileId: "new-player-b",
      pending: [],
    });

    const refreshedRepository = new LocalStoragePlayerProfileRepository(localStorage);
    const refreshed = new PlayerSyncCoordinator(refreshedRepository, remote, localStorage);
    await refreshed.handleAuthentication(accountSession());
    expect(remote.bootstrap).not.toHaveBeenCalled();
    expect(refreshedRepository.getProfile()).toMatchObject({
      playerId: "new-player-b",
      totalXp: 0,
      statistics: { gamesPlayed: 0 },
    });
  });

  it("preserves same-PlayerId authenticated recovery bootstrap", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const local = meaningful(repository.getProfile());
    local.playerId = "account-player";
    repository.saveProfile(local);
    const empty = createDefaultPlayerProfile();
    empty.playerId = local.playerId;
    const recovered = structuredClone(local);
    const canonical = { ...cloud(recovered), playerId: recovered.playerId };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn().mockResolvedValueOnce({ ...cloud(empty), playerId: empty.playerId })
        .mockResolvedValue(canonical),
      bootstrap: vi.fn(async () => canonical),
      applyOperation: vi.fn(), renameCurrentPlayer: vi.fn(),
    };

    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(accountSession());

    expect(remote.bootstrap).toHaveBeenCalledOnce();
    expect(repository.getProfile()).toMatchObject({ playerId: "account-player", totalXp: 100 });
  });

  it("quarantines old-player pending operations while adopting a new authenticated player", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const old = meaningful(repository.getProfile());
    old.playerId = "player-a";
    repository.saveProfile(old);
    const pending = { operationId: "operation-a", payload: { xpDelta: 25 } };
    localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, cloudPlayerId: "player-a", pending: [pending], conflict: false,
    }));
    const fresh = createDefaultPlayerProfile();
    fresh.playerId = "player-b";
    const canonical = { ...cloud(fresh), playerId: fresh.playerId };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => canonical), bootstrap: vi.fn(),
      applyOperation: vi.fn(), renameCurrentPlayer: vi.fn(),
    };

    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(accountSession());

    expect(remote.applyOperation).not.toHaveBeenCalled();
    expect(remote.bootstrap).not.toHaveBeenCalled();
    expect(repository.getProfile()).toMatchObject({ playerId: "player-b", totalXp: 0 });
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!)).toMatchObject({
      cloudPlayerId: "player-b",
      pending: [],
      deferredPending: [{ playerId: "player-a", operations: [pending] }],
    });
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

  it("adopts the server canonical account when local sync still references the pre-migration Guest", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const guest = meaningful(repository.getProfile());
    guest.playerId = "guest-player";
    repository.saveProfile(guest);
    localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      cloudPlayerId: "guest-player",
      bootstrapSourceProfileId: "guest-player",
      pending: [],
      conflict: true,
    }));
    const google = meaningful(createDefaultPlayerProfile());
    google.playerId = "google-player";
    google.displayName = "Yigit";
    google.publicDiscriminator = "A1B2C";
    google.totalXp = 136;
    const canonical = { ...cloud(google), playerId: google.playerId, multiplayerRating: 1042 };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => structuredClone(canonical)),
      bootstrap: vi.fn(), applyOperation: vi.fn(), renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);

    await sync.handleAuthentication(accountSession());

    expect(sync.getCanonicalProfileStatus()).toBe("ready");
    expect(sync.hasConflict()).toBe(false);
    expect(repository.getProfile()).toMatchObject({
      playerId: "google-player",
      displayName: "Yigit",
      publicDiscriminator: "A1B2C",
      totalXp: 136,
    });
    expect(remote.bootstrap).not.toHaveBeenCalled();
  });

  it("detaches old-owner pending operations on sign-out instead of applying them to a new session", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const oldCanonical = cloud(repository.getProfile());
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => oldCanonical), bootstrap: vi.fn(),
      applyOperation: vi.fn().mockRejectedValue(new Error("offline")), renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(accountSession());
    const before = repository.getProfile();
    const after = structuredClone(before);
    after.totalXp += 25;
    after.statistics.gamesPlayed++;
    after.statistics.wins++;
    sync.recordCompletedMatch(before, after);
    await vi.waitFor(() => expect(remote.applyOperation).toHaveBeenCalledOnce());

    sync.resetAfterAuthenticationSignOut();

    const saved = JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!);
    expect(saved).toMatchObject({ pending: [], conflict: false });
    expect(saved).not.toHaveProperty("cloudPlayerId");
    expect(saved.deferredPending).toEqual([{
      playerId: oldCanonical.playerId,
      operations: [expect.objectContaining({ operationId: expect.any(String) })],
    }]);
  });

  it("invalidates an in-flight legacy flush on account switch without dispatching later operations", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const accountA = canonicalFor("player-a", 100);
    const accountB = canonicalFor("player-b", 20);
    let current = accountA;
    const firstResponse = deferred<CloudProfileSnapshot>();
    const first = { operationId: "legacy-a-1", payload: { xpDelta: 10 } };
    const second = { operationId: "legacy-a-2", payload: { xpDelta: 20 } };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => structuredClone(current)), bootstrap: vi.fn(),
      applyOperation: vi.fn(() => firstResponse.promise), renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(accountSessionFor("account-a"));
    localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, cloudPlayerId: "player-a", pending: [first, second], conflict: false,
    }));

    const staleFlush = sync.flushPending();
    await vi.waitFor(() => expect(remote.applyOperation).toHaveBeenCalledOnce());
    sync.resetAfterAuthenticationSignOut();
    current = accountB;
    await sync.handleAuthentication(accountSessionFor("account-b"));
    const profileBeforeStaleResponse = structuredClone(repository.getProfile());
    firstResponse.resolve(canonicalFor("player-a", 110));
    await staleFlush;

    expect(remote.applyOperation).toHaveBeenCalledTimes(1);
    expect(repository.getProfile()).toEqual(profileBeforeStaleResponse);
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!)).toMatchObject({
      cloudPlayerId: "player-b",
      pending: [],
      deferredPending: [{ playerId: "player-a", operations: [first, second] }],
    });
  });

  it("does not let a stale finally clear or duplicate the new generation flush", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const accountA = canonicalFor("player-a", 100);
    const accountB = canonicalFor("player-b", 200);
    let current = accountA;
    const responseA = deferred<CloudProfileSnapshot>();
    const responseB = deferred<CloudProfileSnapshot>();
    const operationA = { operationId: "operation-a", payload: { xpDelta: 10 } };
    const operationB = { operationId: "operation-b", payload: { xpDelta: 15 } };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => structuredClone(current)), bootstrap: vi.fn(),
      applyOperation: vi.fn((operation) => operation.operationId === operationA.operationId
        ? responseA.promise : responseB.promise),
      renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(accountSessionFor("account-a"));
    localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, cloudPlayerId: "player-a", pending: [operationA], conflict: false,
    }));
    const staleFlush = sync.flushPending();
    await vi.waitFor(() => expect(remote.applyOperation).toHaveBeenCalledTimes(1));

    sync.resetAfterAuthenticationSignOut();
    current = accountB;
    await sync.handleAuthentication(accountSessionFor("account-b"));
    const switched = JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!);
    localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      ...switched, cloudPlayerId: "player-b", pending: [operationB],
    }));
    const currentFlush = sync.flushPending();
    await vi.waitFor(() => expect(remote.applyOperation).toHaveBeenCalledTimes(2));
    responseA.resolve(canonicalFor("player-a", 110));
    await staleFlush;

    const deduplicatedFlush = sync.flushPending();
    expect(remote.applyOperation).toHaveBeenCalledTimes(2);
    responseB.resolve(canonicalFor("player-b", 215));
    await Promise.all([currentFlush, deduplicatedFlush]);
    expect(remote.applyOperation).toHaveBeenCalledTimes(2);
    expect(repository.getProfile()).toMatchObject({ playerId: "player-b", totalXp: 215 });
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
  });

  it("preserves a response-lost operation for an idempotent retry by the same owner", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const canonical = canonicalFor("player-a", 100);
    const operation = { operationId: "committed-response-lost", payload: { xpDelta: 25 } };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => structuredClone(canonical)), bootstrap: vi.fn(),
      applyOperation: vi.fn()
        .mockRejectedValueOnce(new Error("response lost after commit"))
        .mockResolvedValue(canonicalFor("player-a", 125)),
      renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(accountSessionFor("account-a"));
    localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, cloudPlayerId: "player-a", pending: [operation], conflict: false,
    }));
    await sync.flushPending();
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([operation]);

    sync.resetAfterAuthenticationSignOut();
    await sync.handleAuthentication(accountSessionFor("account-a"));
    expect(remote.applyOperation).toHaveBeenCalledTimes(2);
    expect(remote.applyOperation).toHaveBeenNthCalledWith(1, operation);
    expect(remote.applyOperation).toHaveBeenNthCalledWith(2, operation);
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
  });

  it("treats an old A response as stale after an A to B to A generation cycle", async () => {
    const localStorage = storage();
    const repository = new LocalStoragePlayerProfileRepository(localStorage);
    const playerA = canonicalFor("player-a", 100);
    const playerB = canonicalFor("player-b", 200);
    let current = playerA;
    const oldResponse = deferred<CloudProfileSnapshot>();
    const operation = { operationId: "old-a-operation", payload: { xpDelta: 25 } };
    const remote: CloudPlayerSyncPort = {
      loadCurrent: vi.fn(async () => structuredClone(current)), bootstrap: vi.fn(),
      applyOperation: vi.fn()
        .mockImplementationOnce(() => oldResponse.promise)
        .mockResolvedValue(canonicalFor("player-a", 130)),
      renameCurrentPlayer: vi.fn(),
    };
    const sync = new PlayerSyncCoordinator(repository, remote, localStorage);
    await sync.handleAuthentication(accountSessionFor("account-a"));
    localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, cloudPlayerId: "player-a", pending: [operation], conflict: false,
    }));
    const staleFlush = sync.flushPending();
    await vi.waitFor(() => expect(remote.applyOperation).toHaveBeenCalledOnce());
    sync.resetAfterAuthenticationSignOut();
    current = playerB;
    await sync.handleAuthentication(accountSessionFor("account-b"));
    sync.resetAfterAuthenticationSignOut();
    current = playerA;
    await sync.handleAuthentication(accountSessionFor("account-a"));
    const currentProfile = structuredClone(repository.getProfile());

    oldResponse.resolve(canonicalFor("player-a", 125));
    await staleFlush;
    expect(repository.getProfile()).toEqual(currentProfile);
    expect(repository.getProfile()).toMatchObject({ playerId: "player-a", totalXp: 130 });
    expect(JSON.parse(localStorage.getItem(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
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
