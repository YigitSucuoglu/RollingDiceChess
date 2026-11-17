import { describe, expect, it, vi } from "vitest";
import { LocalStoragePlayerProfileRepository } from "../../src/profile/LocalStoragePlayerProfileRepository";
import { PLAYER_PROFILE_STORAGE_KEY, createDefaultPlayerProfile } from "../../src/profile/PlayerProfile";
import { COMPLETION_JOURNAL_KEY, CompletionJournal, type CompletionEntry } from "../../src/profile/CompletionJournal";
import { PLAYER_SYNC_STORAGE_KEY, PlayerSyncCoordinator, type CloudPlayerSyncPort, type CloudProfileSnapshot } from "../../src/profile/PlayerSync";
import { toAccountId } from "../../src/application/auth/AuthenticationContracts";
import { toPlayerId } from "../../src/application/players/PlayerContracts";
import { PlayerProfileService } from "../../src/profile/PlayerProfileService";
import { createDefaultGameSetup } from "../../src/config/gameSetup";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function fixture() {
  const values = new Map<string, string>();
  let failKey: string | undefined;
  let readFailureKey: string | undefined;
  let scheduledWriteFailure: { key: string; remaining: number } | undefined;
  const storage = {
    getItem: (key: string) => {
      if (key === readFailureKey) throw new Error("storage read denied");
      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (key === failKey) throw new Error("quota or permission denied");
      if (scheduledWriteFailure?.key === key) {
        scheduledWriteFailure.remaining--;
        if (scheduledWriteFailure.remaining === 0) {
          scheduledWriteFailure = undefined;
          throw new Error("scheduled storage write failure");
        }
      }
      values.set(key, value);
    },
    removeItem: (key: string) => { values.delete(key); },
  };
  const repository = new LocalStoragePlayerProfileRepository(storage);
  const before = repository.getProfile();
  before.playerId = "player-a";
  repository.saveProfile(before);
  const cloud: CloudProfileSnapshot = {
    bootstrapApplied: false, playerId: before.playerId, profile: structuredClone(before),
    multiplayerRating: 1000, multiplayerStatistics: {
      rating: 1000, rankedGames: 0, rankedWins: 0, rankedLosses: 0,
      rankedWinRate: 0, unrankedGames: 0, currentRankedWinStreak: 0,
      bestRankedWinStreak: 0, totalMultiplayerPlayTimeMs: 0,
      multiplayerKingsCaptured: 0, multiplayerRouletteRolls: 0,
    },
    rouletteStatistics: { mostRolledPiece: null, mostRolledPieceCount: 0,
      mostPlayedPiece: null, mostPlayedPieceCount: 0, threeRightsTurns: 0,
      playerTurnsCompleted: 0, threeRightsUsedRate: 0, tripleRolls: [], },
  };
  const remote: CloudPlayerSyncPort = {
    loadCurrent: vi.fn(async () => structuredClone(cloud)), bootstrap: vi.fn(),
    applyOperation: vi.fn().mockRejectedValue(new Error("offline")), renameCurrentPlayer: vi.fn(),
  };
  const sync = new PlayerSyncCoordinator(repository, remote, storage);
  storage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1, cloudPlayerId: before.playerId, pending: [], conflict: false,
  }));
  const after = structuredClone(before);
  after.totalXp = 50;
  after.statistics.gamesPlayed = 1;
  after.statistics.wins = 1;
  after.processedMatchIds = ["match-1"];
  const snapshot = { matchId: "match-1", playerId: toPlayerId(before.playerId),
    mode: "singleplayer" as const, playerColor: "white" as const,
    status: "completed" as const, terminationReason: "king-captured" as const,
    winner: "white" as const, valid: true, complete: true };
  const session = { schemaVersion: 1 as const, state: { status: "authenticated" as const,
    account: { accountId: toAccountId("account-a"), provider: "google" as const } } };
  await sync.handleAuthentication(session);
  return { values, storage, repository, sync, remote, before, after, snapshot, session,
    fail: (key?: string) => { failKey = key; },
    failRead: (key?: string) => { readFailureKey = key; },
    failWriteOn: (key: string, occurrence: number) => {
      scheduledWriteFailure = { key, remaining: occurrence };
    } };
}

describe("durable completion journal", () => {
  it("does not advance the profile when the first journal write fails", async () => {
    const f = await fixture();
    f.fail(COMPLETION_JOURNAL_KEY);
    expect(() => f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot)).toThrow();
    expect(f.repository.getProfile().totalXp).toBe(0);
    expect(f.values.has(COMPLETION_JOURNAL_KEY)).toBe(false);
    f.fail();
    expect(f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot)).toBe(true);
  });

  it("propagates QuotaExceededError before committing cloud-backed progression", async () => {
    const f = await fixture();
    const originalSetItem = f.storage.setItem;
    f.storage.setItem = (key, value) => {
      if (key === COMPLETION_JOURNAL_KEY) {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      }
      originalSetItem(key, value);
    };
    expect(() => f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot))
      .toThrow(DOMException);
    expect(f.repository.getProfile().statistics.gamesPlayed).toBe(0);
    expect(f.values.has(COMPLETION_JOURNAL_KEY)).toBe(false);
  });

  for (const failedKey of [PLAYER_PROFILE_STORAGE_KEY, PLAYER_SYNC_STORAGE_KEY]) {
    it(`recovers after ${failedKey} projection failure with stable identities`, async () => {
      const f = await fixture();
      f.fail(failedKey);
      expect(() => f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot)).toThrow();
      const original = JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)[0];
      f.fail();
      const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
      await restored.handleAuthentication(f.session);
      const saved = JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!);
      expect(saved.pending).toEqual([original.operation]);
      expect(f.repository.getProfile()).toMatchObject({ totalXp: 50, statistics: { gamesPlayed: 1 } });
      expect(original.matchId).toBe("match-1");
      await restored.handleAuthentication(f.session);
      expect(f.repository.getProfile().statistics.gamesPlayed).toBe(1);
    });
  }

  it("keeps the same operation after a lost server response and reload", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    await vi.waitFor(() => expect(f.remote.applyOperation).toHaveBeenCalledTimes(1));
    const operation = JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending[0];
    const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await restored.handleAuthentication(f.session);
    expect(f.remote.applyOperation).toHaveBeenCalledWith(operation);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([operation]);
  });

  it("recovers multiple completions in order without duplicating local progression", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    const second = structuredClone(f.after);
    second.totalXp = 80;
    second.statistics.gamesPlayed = 2;
    second.statistics.wins = 2;
    second.processedMatchIds.push("match-2");
    f.sync.recordDurableCompletedMatch(f.after, second, "match-2", {
      ...f.snapshot, matchId: "match-2",
    });
    const original = JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!);
    f.repository.saveProfile(f.before);
    f.values.set(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, cloudPlayerId: "player-a", pending: [], conflict: false,
    }));

    const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await restored.handleAuthentication(f.session);
    const queue = JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending;
    expect(queue).toEqual(original.map((entry: { operation: unknown }) => entry.operation));
    expect(f.repository.getProfile()).toMatchObject({ totalXp: 80, statistics: { gamesPlayed: 2 } });
    expect(f.repository.getProfile().processedMatchIds).toEqual(["match-1", "match-2"]);
    restored.resetAfterAuthenticationSignOut();
    await restored.handleAuthentication(f.session);
    expect(f.repository.getProfile().statistics.gamesPlayed).toBe(2);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual(queue);
  });

  it("recovers both matches when the second queue projection fails", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    await f.sync.flushPending();
    const second = structuredClone(f.after);
    second.totalXp = 95;
    second.statistics.gamesPlayed = 2;
    second.statistics.wins = 2;
    second.processedMatchIds.push("match-2");
    f.fail(PLAYER_SYNC_STORAGE_KEY);
    expect(() => f.sync.recordDurableCompletedMatch(f.after, second, "match-2", {
      ...f.snapshot, matchId: "match-2",
    })).toThrow();
    const journal = JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!);
    expect(journal.map((entry: CompletionEntry) => entry.matchId)).toEqual(["match-1", "match-2"]);
    f.fail();
    const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await restored.handleAuthentication(f.session);
    const queue = JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending;
    expect(queue).toEqual(journal.map((entry: CompletionEntry) => entry.operation));
    expect(new Set(queue.map((operation: { operationId: string }) => operation.operationId)).size).toBe(2);
    expect(f.repository.getProfile()).toMatchObject({ totalXp: 95, statistics: { gamesPlayed: 2 } });
  });

  it("retries safely if server commit succeeds but journal acknowledgment cannot persist", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    const operation = JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending[0];
    vi.mocked(f.remote.applyOperation).mockResolvedValue({
      ...(await f.remote.loadCurrent()), profile: structuredClone(f.after),
    });
    f.fail(COMPLETION_JOURNAL_KEY);
    await f.sync.handleAuthentication(f.session);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([operation]);
    f.fail();
    const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await restored.handleAuthentication(f.session);
    expect(f.remote.applyOperation).toHaveBeenNthCalledWith(2, operation);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
    expect(JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)).toEqual([]);
  });

  it("retries an acknowledged operation when queue removal fails, then prunes its journal", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    await f.sync.flushPending();
    const operation = JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending[0];
    vi.mocked(f.remote.applyOperation).mockResolvedValue({
      ...(await f.remote.loadCurrent()), profile: structuredClone(f.after),
    });
    f.fail(PLAYER_SYNC_STORAGE_KEY);
    await f.sync.flushPending();
    expect(JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)[0].acknowledged).toBe(true);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([operation]);

    f.fail();
    const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await restored.handleAuthentication(f.session);
    expect(f.remote.applyOperation).toHaveBeenLastCalledWith(operation);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
    expect(JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)).toEqual([]);
    expect(f.repository.getProfile().statistics.gamesPlayed).toBe(1);
  });

  it("keeps a durable acknowledgment when journal cleanup fails after queue removal", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    await f.sync.flushPending();
    vi.mocked(f.remote.applyOperation).mockResolvedValue({
      ...(await f.remote.loadCurrent()), profile: structuredClone(f.after),
    });
    f.failWriteOn(COMPLETION_JOURNAL_KEY, 2);
    await f.sync.flushPending();
    expect(JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)[0].acknowledged).toBe(true);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
    const callsBeforeReload = vi.mocked(f.remote.applyOperation).mock.calls.length;
    vi.mocked(f.remote.loadCurrent).mockResolvedValue({
      ...(await f.remote.loadCurrent()), profile: structuredClone(f.after),
    });

    const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await restored.handleAuthentication(f.session);
    expect(f.remote.applyOperation).toHaveBeenCalledTimes(callsBeforeReload);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
    expect(f.repository.getProfile().statistics.gamesPlayed).toBe(1);
  });

  it("preserves unreadable and malformed journal data without replay or silent deletion", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    await f.sync.flushPending();
    const original = f.values.get(COMPLETION_JOURNAL_KEY)!;
    f.failRead(COMPLETION_JOURNAL_KEY);
    const unreadable = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await unreadable.handleAuthentication(f.session);
    expect(unreadable.getCanonicalProfileStatus()).toBe("unavailable");
    expect(f.values.get(COMPLETION_JOURNAL_KEY)).toBe(original);
    f.failRead();

    f.values.set(COMPLETION_JOURNAL_KEY, "{malformed");
    const malformed = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await malformed.handleAuthentication(f.session);
    expect(malformed.getCanonicalProfileStatus()).toBe("unavailable");
    expect(f.values.get(COMPLETION_JOURNAL_KEY)).toBe("{malformed");
    expect(f.remote.applyOperation).toHaveBeenCalledTimes(1);
  });

  it("reuses the first operation identity when retrying a partially projected completion", async () => {
    const f = await fixture();
    f.fail(PLAYER_SYNC_STORAGE_KEY);
    expect(() => f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot)).toThrow();
    const original = JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)[0].operation;
    f.fail();
    expect(f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot)).toBe(true);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([original]);
    expect(f.repository.getProfile().statistics.gamesPlayed).toBe(1);
  });

  it("survives a second storage failure while retrying the same completion", async () => {
    const f = await fixture();
    f.fail(PLAYER_PROFILE_STORAGE_KEY);
    expect(() => f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot)).toThrow();
    const operation = JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)[0].operation;
    f.fail(PLAYER_SYNC_STORAGE_KEY);
    expect(() => f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot)).toThrow();
    f.fail();
    const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await restored.handleAuthentication(f.session);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([operation]);
    expect(f.repository.getProfile().statistics.gamesPlayed).toBe(1);
  });

  it("does not dispatch A journal entries under B, then restores them for A", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    const playerB = createDefaultPlayerProfile();
    playerB.playerId = "player-b";
    vi.mocked(f.remote.loadCurrent).mockResolvedValueOnce({
      ...(await f.remote.loadCurrent()), playerId: "player-b", profile: playerB,
    });
    const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await restored.handleAuthentication({ ...f.session, state: { ...f.session.state,
      account: { accountId: toAccountId("account-b"), provider: "google" } } });
    expect(f.remote.applyOperation).toHaveBeenCalledTimes(1);
    restored.resetAfterAuthenticationSignOut();
    await restored.handleAuthentication(f.session);
    expect(f.remote.applyOperation).toHaveBeenCalledTimes(2);
  });

  it("keeps a retired Guest journal isolated when Google is the migration survivor", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    await f.sync.flushPending();
    const guestEntry = JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)[0];
    const callsBeforeMigration = vi.mocked(f.remote.applyOperation).mock.calls.length;
    f.sync.resetAfterAuthenticationSignOut();
    const google = createDefaultPlayerProfile();
    google.playerId = "player-google";
    vi.mocked(f.remote.loadCurrent).mockResolvedValue({
      ...(await f.remote.loadCurrent()), playerId: google.playerId, profile: google,
    });
    await f.sync.adoptCanonicalAfterAccountMigration(google.playerId);
    await f.sync.handleAuthentication({ ...f.session, state: { ...f.session.state,
      account: { accountId: toAccountId("google-account"), provider: "google" } } });

    expect(f.repository.getProfile().playerId).toBe(google.playerId);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
    expect(JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)).toEqual([guestEntry]);
    expect(f.remote.applyOperation).toHaveBeenCalledTimes(callsBeforeMigration);
  });

  it("rejects a late Guest journal response after Google survivor adoption", async () => {
    const f = await fixture();
    const oldResponse = deferred<CloudProfileSnapshot>();
    vi.mocked(f.remote.applyOperation).mockImplementation(() => oldResponse.promise);
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    const oldFlush = f.sync.flushPending();
    await vi.waitFor(() => expect(f.remote.applyOperation).toHaveBeenCalledTimes(1));
    f.sync.resetAfterAuthenticationSignOut();
    const google = createDefaultPlayerProfile();
    google.playerId = "player-google";
    vi.mocked(f.remote.loadCurrent).mockResolvedValue({
      ...(await f.remote.loadCurrent()), playerId: google.playerId, profile: google,
    });
    await f.sync.adoptCanonicalAfterAccountMigration(google.playerId);
    await f.sync.handleAuthentication({ ...f.session, state: { ...f.session.state,
      account: { accountId: toAccountId("google-account"), provider: "google" } } });
    oldResponse.resolve({ ...(await f.remote.loadCurrent()),
      playerId: f.before.playerId, profile: f.after });
    await oldFlush;
    expect(f.repository.getProfile().playerId).toBe(google.playerId);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
    expect(JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)[0].ownerPlayerId).toBe(f.before.playerId);
  });

  it("recovers the Guest survivor operation without merging a retired Google journal", async () => {
    const f = await fixture();
    f.sync.recordDurableCompletedMatch(f.before, f.after, "match-1", f.snapshot);
    await f.sync.flushPending();
    const guestEntry = JSON.parse(f.values.get(COMPLETION_JOURNAL_KEY)!)[0] as CompletionEntry;
    const googleProfile = createDefaultPlayerProfile();
    googleProfile.playerId = "player-google";
    googleProfile.processedMatchIds = ["google-match"];
    const googleEntry: CompletionEntry = {
      ...guestEntry, matchId: "google-match", ownerPlayerId: googleProfile.playerId,
      profile: googleProfile, operation: {
        operationId: "google-operation", payload: {
          ...guestEntry.operation.payload,
          singleMatch: { schemaVersion: 1, matchId: "google-match", snapshot: {
            ...f.snapshot, matchId: "google-match", playerId: googleProfile.playerId,
          } },
        },
      },
    };
    new CompletionJournal(f.storage).append(googleEntry);
    f.sync.resetAfterAuthenticationSignOut();
    await f.sync.adoptCanonicalAfterAccountMigration(f.before.playerId);
    await f.sync.handleAuthentication({ ...f.session, state: { ...f.session.state,
      account: { accountId: toAccountId("google-account"), provider: "google" } } });

    const pending = JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending;
    expect(pending).toEqual([guestEntry.operation]);
    expect(f.remote.applyOperation).not.toHaveBeenCalledWith(googleEntry.operation);
    expect(f.values.get(COMPLETION_JOURNAL_KEY)).toContain("google-operation");
    expect(f.repository.getProfile().playerId).toBe(f.before.playerId);
  });

  it("keeps local-only completion local and counts a duplicate terminal event once", async () => {
    const f = await fixture();
    const service = new PlayerProfileService(f.repository);
    const game = service.createGameSession(createDefaultGameSetup());
    const completed = { eventId: 1, winner: "white" as const,
      reason: "king-captured" as const, finalPieceCounts: { white: 1, black: 0 } };
    game.eventSink.onGameCompleted(completed);
    game.eventSink.onGameCompleted(completed);
    expect(f.repository.getProfile().statistics.gamesPlayed).toBe(1);
    expect(f.values.has(COMPLETION_JOURNAL_KEY)).toBe(false);
    expect(f.values.has(PLAYER_SYNC_STORAGE_KEY)).toBe(true);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!).pending).toEqual([]);
  });

  it("reads a legacy profile and pending/deferred queue without a journal", async () => {
    const f = await fixture();
    f.values.delete(COMPLETION_JOURNAL_KEY);
    f.values.set(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, playerId: "player-a", displayName: "Legacy",
      createdAt: "2026-01-01T00:00:00.000Z", totalXp: 0,
      statistics: { gamesPlayed: 0, wins: 0, losses: 0 }, processedMatchIds: [],
    }));
    expect(f.repository.getProfile()).toMatchObject({
      playerId: "player-a", displayName: "Legacy", statistics: { gamesPlayed: 0 },
    });
    const legacy = { operationId: "legacy-id", payload: { xpDelta: 5, gamesDelta: 1 } };
    const deferred = { operationId: "other-owner-id", payload: { xpDelta: 7 } };
    f.values.set(PLAYER_SYNC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, cloudPlayerId: "player-a", pending: [legacy],
      deferredPending: [{ playerId: "player-b", operations: [deferred] }], conflict: false,
    }));
    const restored = new PlayerSyncCoordinator(f.repository, f.remote, f.storage);
    await restored.handleAuthentication(f.session);
    expect(f.remote.applyOperation).toHaveBeenCalledWith(legacy);
    expect(f.remote.applyOperation).not.toHaveBeenCalledWith(deferred);
    expect(JSON.parse(f.values.get(PLAYER_SYNC_STORAGE_KEY)!)).toMatchObject({
      pending: [legacy], deferredPending: [{ playerId: "player-b", operations: [deferred] }],
    });
    expect(f.values.has(COMPLETION_JOURNAL_KEY)).toBe(false);
  });
});
