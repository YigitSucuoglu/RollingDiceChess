import type { AuthenticationSession } from "../application/auth/AuthenticationContracts";
import { PROFILE_PIECE_ORDER, type PieceCounters, type PlayerProfile } from "./PlayerProfile";
import type { PlayerProfileRepository } from "./PlayerProfileRepository";

export const PLAYER_SYNC_STORAGE_KEY = "roulettechess.player-sync.v1";

export interface CloudProfileSnapshot {
  readonly bootstrapApplied: boolean;
  readonly playerId: string;
  readonly profile: PlayerProfile;
  readonly multiplayerRating: number;
}

export interface ProgressionOperation {
  readonly operationId: string;
  readonly payload: Record<string, unknown>;
}

export interface CloudPlayerSyncPort {
  loadCurrent(): Promise<CloudProfileSnapshot>;
  bootstrap(profile: PlayerProfile): Promise<CloudProfileSnapshot>;
  applyOperation(operation: ProgressionOperation): Promise<CloudProfileSnapshot>;
  renameCurrentPlayer(displayName: string): Promise<CloudProfileSnapshot>;
}

export type CanonicalProfileStatus = "not-applicable" | "loading" | "ready" | "unavailable";

interface SyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface PlayerSyncState {
  readonly schemaVersion: 1;
  readonly cloudPlayerId?: string;
  readonly bootstrapSourceProfileId?: string;
  readonly pending: readonly ProgressionOperation[];
  readonly deferredPending?: readonly DeferredProgressionOperations[];
  readonly conflict: boolean;
}

interface DeferredProgressionOperations {
  readonly playerId: string;
  readonly operations: readonly ProgressionOperation[];
}

const EMPTY_STATE: PlayerSyncState = { schemaVersion: 1, pending: [], conflict: false };

function hasCounters(counters: PieceCounters): boolean {
  return PROFILE_PIECE_ORDER.some((piece) => counters[piece] > 0);
}

export function isMeaningfulLocalProfile(profile: PlayerProfile): boolean {
  const stats = profile.statistics;
  return profile.totalXp > 0 || stats.gamesPlayed > 0 || stats.rouletteRolls > 0
    || hasCounters(stats.rollsByPiece) || hasCounters(stats.movesByPiece)
    || hasCounters(stats.capturesByPiece);
}

export function isMeaningfulCloudProfile(snapshot: CloudProfileSnapshot): boolean {
  return snapshot.bootstrapApplied || isMeaningfulLocalProfile(snapshot.profile);
}

function counterDelta(after: PieceCounters, before: PieceCounters): PieceCounters {
  return Object.fromEntries(PROFILE_PIECE_ORDER.map((piece) => [
    piece, Math.max(0, after[piece] - before[piece]),
  ])) as PieceCounters;
}

export function createProgressionOperation(
  before: PlayerProfile,
  after: PlayerProfile,
  operationId: string,
): ProgressionOperation | null {
  const previous = before.statistics;
  const next = after.statistics;
  const gamesDelta = next.gamesPlayed - previous.gamesPlayed;
  const winsDelta = next.wins - previous.wins;
  const lossesDelta = next.losses - previous.losses;
  if (gamesDelta !== 1 || winsDelta + lossesDelta !== 1) return null;
  return {
    operationId,
    payload: {
      xpDelta: after.totalXp - before.totalXp,
      gamesDelta,
      winsDelta,
      lossesDelta,
      playTimeSecondsDelta: next.totalPlayTimeSeconds - previous.totalPlayTimeSeconds,
      kingsCapturedDelta: next.kingsCaptured - previous.kingsCaptured,
      rouletteRollsDelta: next.rouletteRolls - previous.rouletteRolls,
      playerTurnsCompletedDelta: next.playerTurnsCompleted - previous.playerTurnsCompleted,
      threeRightsTurnsDelta: next.threeRightsTurns - previous.threeRightsTurns,
      triplePawnRollsDelta: next.triplePawnRolls - previous.triplePawnRolls,
      tripleKnightRollsDelta: next.tripleKnightRolls - previous.tripleKnightRolls,
      tripleQueenRollsDelta: next.tripleQueenRolls - previous.tripleQueenRolls,
      rollsByPieceDelta: counterDelta(next.rollsByPiece, previous.rollsByPiece),
      movesByPieceDelta: counterDelta(next.movesByPiece, previous.movesByPiece),
      capturesByPieceDelta: counterDelta(next.capturesByPiece, previous.capturesByPiece),
    },
  };
}

export class PlayerSyncCoordinator {
  private readonly local: PlayerProfileRepository;
  private readonly remote: CloudPlayerSyncPort;
  private readonly storage?: SyncStorage;
  private connected = false;
  private initializing?: Promise<void>;
  private flushing?: Promise<void>;
  private memoryState: PlayerSyncState = EMPTY_STATE;
  private migrationSuspended = false;
  private canonicalProfileStatus: CanonicalProfileStatus = "not-applicable";
  private accountAuthenticated = false;

  public constructor(local: PlayerProfileRepository, remote: CloudPlayerSyncPort, storage?: SyncStorage) {
    this.local = local;
    this.remote = remote;
    this.storage = storage;
  }

  public isCloudCanonical(): boolean {
    return Boolean(this.readState().cloudPlayerId);
  }

  public hasConflict(): boolean {
    return this.readState().conflict;
  }

  public isAccountMigrationSuspended(): boolean {
    return this.migrationSuspended;
  }

  public getCanonicalProfileStatus(): CanonicalProfileStatus {
    return this.canonicalProfileStatus;
  }

  public suspendForAccountMigration(): void {
    this.migrationSuspended = true;
  }

  public resumeAfterAccountMigrationFailure(): void {
    this.migrationSuspended = false;
  }

  public resetAfterAuthenticationSignOut(): void {
    const state = this.readState();
    const deferredPending = [...(state.deferredPending ?? [])];
    if (state.cloudPlayerId && state.pending.length > 0) {
      const existing = deferredPending.find((entry) => entry.playerId === state.cloudPlayerId);
      const operations = [
        ...(existing?.operations ?? []),
        ...state.pending,
      ].filter((operation, index, all) =>
        all.findIndex((candidate) => candidate.operationId === operation.operationId) === index);
      const withoutOwner = deferredPending.filter((entry) => entry.playerId !== state.cloudPlayerId);
      deferredPending.splice(0, deferredPending.length, ...withoutOwner, {
        playerId: state.cloudPlayerId,
        operations,
      });
    }
    this.writeState({
      schemaVersion: 1,
      pending: [],
      deferredPending,
      conflict: false,
    });
    this.connected = false;
    this.accountAuthenticated = false;
    this.migrationSuspended = false;
    this.canonicalProfileStatus = "not-applicable";
    this.initializing = undefined;
    this.flushing = undefined;
  }

  public async handleAuthentication(session: AuthenticationSession): Promise<void> {
    this.accountAuthenticated = session.state.status === "authenticated";
    this.connected = session.state.status === "authenticated"
      || (session.state.status === "guest" && session.state.persistence === "cloud");
    if (!this.connected) {
      this.canonicalProfileStatus = "not-applicable";
      return;
    }
    this.canonicalProfileStatus = "loading";
    if (!this.initializing) {
      this.initializing = this.initialize().finally(() => { this.initializing = undefined; });
    }
    await this.initializing;
  }

  public recordCompletedMatch(before: PlayerProfile, after: PlayerProfile): void {
    if (this.migrationSuspended) return;
    const state = this.readState();
    if (!state.cloudPlayerId || state.conflict) return;
    const operation = createProgressionOperation(before, after, crypto.randomUUID());
    if (!operation) return;
    const pending = [...state.pending.filter((item) => item.operationId !== operation.operationId), operation];
    this.writeState({ ...state, pending });
    if (this.connected) void this.flushPending();
  }

  public async reconnect(): Promise<void> {
    if (!this.connected) return;
    const activeFlush = this.flushing;
    if (activeFlush) await activeFlush;
    await this.flushPending();
  }

  public async flushPending(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.flush().finally(() => { this.flushing = undefined; });
    }
    await this.flushing;
  }

  public async prepareForAccountMigration(): Promise<boolean> {
    const state = this.readState();
    if (!this.connected || !state.cloudPlayerId || state.conflict) return false;
    await this.flushPending();
    return this.readState().pending.length === 0;
  }

  public async adoptCanonicalAfterAccountMigration(
    expectedPlayerId?: string,
  ): Promise<CloudProfileSnapshot> {
    const state = this.readState();
    if (state.pending.length > 0) {
      throw new Error("Pending progression must be synchronized before account migration.");
    }
    this.initializing = undefined;
    const canonical = await this.remote.loadCurrent();
    if (expectedPlayerId && canonical.playerId !== expectedPlayerId) {
      throw new Error("Cloud canonical profile does not match the migration survivor.");
    }
    this.writeState({
      schemaVersion: 1,
      cloudPlayerId: canonical.playerId,
      bootstrapSourceProfileId: canonical.profile.playerId,
      pending: [],
      conflict: false,
    });
    this.local.saveProfile(canonical.profile);
    this.connected = true;
    this.migrationSuspended = false;
    this.canonicalProfileStatus = "ready";
    return canonical;
  }

  public async renameCurrentPlayer(displayName: string): Promise<CloudProfileSnapshot> {
    const before = this.local.getProfile();
    const state = this.readState();
    if (!this.accountAuthenticated || !this.connected || this.canonicalProfileStatus !== "ready"
        || !state.cloudPlayerId || state.conflict || this.migrationSuspended) {
      throw new Error("Canonical account profile is unavailable.");
    }
    const canonical = await this.remote.renameCurrentPlayer(displayName);
    if (canonical.playerId !== before.playerId
        || canonical.profile.publicDiscriminator !== before.publicDiscriminator) {
      throw new Error("Identity changed during username update.");
    }
    this.local.saveProfile(canonical.profile);
    return canonical;
  }

  private async initialize(): Promise<void> {
    try {
      const cloud = await this.remote.loadCurrent();
      const local = this.local.getProfile();
      let state = this.readState();
      const deferred = state.deferredPending?.find((entry) => entry.playerId === cloud.playerId);
      if (deferred) {
        state = {
          ...state,
          pending: deferred.operations,
          deferredPending: state.deferredPending?.filter((entry) => entry.playerId !== cloud.playerId),
        };
      }
      const knownCloud = state.cloudPlayerId === cloud.playerId;
      if (this.accountAuthenticated && !knownCloud && state.cloudPlayerId && state.pending.length > 0) {
        state = {
          ...state,
          pending: [],
          deferredPending: [
            ...(state.deferredPending ?? []).filter((entry) => entry.playerId !== state.cloudPlayerId),
            { playerId: state.cloudPlayerId, operations: state.pending },
          ],
        };
      }
      if (!this.accountAuthenticated && isMeaningfulCloudProfile(cloud)
          && isMeaningfulLocalProfile(local) && !knownCloud) {
        this.writeState({ ...state, conflict: true });
        this.canonicalProfileStatus = "unavailable";
        return;
      }
      let canonical = cloud;
      const bootstrapOwnsCanonicalIdentity = !this.accountAuthenticated
        || local.playerId === cloud.playerId;
      if (!knownCloud && !isMeaningfulCloudProfile(cloud) && isMeaningfulLocalProfile(local)
          && bootstrapOwnsCanonicalIdentity) {
        canonical = await this.remote.bootstrap(local);
      }
      this.writeState({
        ...state,
        cloudPlayerId: canonical.playerId,
        bootstrapSourceProfileId: this.accountAuthenticated
          ? canonical.playerId
          : state.bootstrapSourceProfileId ?? local.playerId,
        conflict: false,
      });
      if (this.readState().pending.length > 0) await this.flushPending();
      else this.local.saveProfile(canonical.profile);
      this.canonicalProfileStatus = "ready";
    } catch {
      this.canonicalProfileStatus = "unavailable";
      // Local profile remains usable; reconnect or the next match retries safely.
    }
  }

  private async flush(): Promise<void> {
    let state = this.readState();
    if (!state.cloudPlayerId || state.conflict) return;
    let canonical: CloudProfileSnapshot | undefined;
    for (const operation of state.pending) {
      try {
        canonical = await this.remote.applyOperation(operation);
        state = this.readState();
        this.writeState({ ...state, pending: state.pending.filter((item) => item.operationId !== operation.operationId) });
      } catch {
        return;
      }
    }
    if (canonical) this.local.saveProfile(canonical.profile);
  }

  private readState(): PlayerSyncState {
    try {
      const raw = this.storage?.getItem(PLAYER_SYNC_STORAGE_KEY);
      if (!raw) return this.memoryState;
      const value = JSON.parse(raw) as Partial<PlayerSyncState>;
      if (value.schemaVersion !== 1 || !Array.isArray(value.pending)) return EMPTY_STATE;
      const deferredPending = Array.isArray(value.deferredPending)
        ? value.deferredPending.filter((entry): entry is DeferredProgressionOperations =>
          Boolean(entry && typeof entry.playerId === "string" && Array.isArray(entry.operations)))
        : [];
      return { schemaVersion: 1, pending: value.pending, deferredPending,
        conflict: value.conflict === true,
        ...(typeof value.cloudPlayerId === "string" ? { cloudPlayerId: value.cloudPlayerId } : {}),
        ...(typeof value.bootstrapSourceProfileId === "string" ? { bootstrapSourceProfileId: value.bootstrapSourceProfileId } : {}) };
    } catch { return EMPTY_STATE; }
  }

  private writeState(state: PlayerSyncState): void {
    this.memoryState = state;
    try { this.storage?.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify(state)); } catch { /* The in-memory queue still preserves this runtime. */ }
  }
}
