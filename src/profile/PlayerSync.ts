import type { AuthenticationSession } from "../application/auth/AuthenticationContracts";
import type { SingleMatchAchievementSnapshot } from "../domain/achievements/AchievementContracts";
import { PROFILE_PIECE_ORDER, type PieceCounters, type PlayerProfile } from "./PlayerProfile";
import type { PlayerProfileRepository } from "./PlayerProfileRepository";
import { CompletionJournal, type CompletionEntry } from "./CompletionJournal";
import { LocalStoragePlayerProfileRepository } from "./LocalStoragePlayerProfileRepository";

export const PLAYER_SYNC_STORAGE_KEY = "roulettechess.player-sync.v1";

export interface MultiplayerStatisticsSnapshot {
  readonly rating: number;
  readonly rankedGames: number;
  readonly rankedWins: number;
  readonly rankedLosses: number;
  readonly rankedWinRate: number;
  readonly unrankedGames: number;
  readonly currentRankedWinStreak: number;
  readonly bestRankedWinStreak: number;
  readonly totalMultiplayerPlayTimeMs: number;
  readonly multiplayerKingsCaptured: number;
  readonly multiplayerRouletteRolls: number;
}

export interface RankedPieceCount { readonly pieceType: keyof PieceCounters; readonly count: number }
export interface GlobalRouletteStatisticsSnapshot {
  readonly movesByPiece?: Readonly<PieceCounters>;
  readonly mostRolledPiece: keyof PieceCounters | null;
  readonly mostRolledPieceCount: number;
  readonly mostPlayedPiece: keyof PieceCounters | null;
  readonly mostPlayedPieceCount: number;
  readonly threeRightsTurns: number;
  readonly playerTurnsCompleted: number;
  readonly threeRightsUsedRate: number;
  readonly tripleRolls: readonly RankedPieceCount[];
}

export interface CloudProfileSnapshot {
  readonly bootstrapApplied: boolean;
  readonly playerId: string;
  readonly profile: PlayerProfile;
  readonly multiplayerRating: number;
  readonly multiplayerStatistics: MultiplayerStatisticsSnapshot;
  readonly rouletteStatistics: GlobalRouletteStatisticsSnapshot;
}

export interface ProgressionOperation {
  readonly operationId: string;
  readonly payload: Record<string, unknown>;
}

export interface SingleMatchProgressionPayload {
  readonly schemaVersion: 1;
  readonly matchId: string;
  readonly snapshot: SingleMatchAchievementSnapshot;
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

interface SyncContext {
  readonly generation: number;
  readonly playerId: string;
}

interface ActiveFlush {
  readonly context: SyncContext;
  promise: Promise<void>;
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
  singleMatch?: SingleMatchAchievementSnapshot,
): ProgressionOperation | null {
  const previous = before.statistics;
  const next = after.statistics;
  const gamesDelta = next.gamesPlayed - previous.gamesPlayed;
  const winsDelta = next.wins - previous.wins;
  const lossesDelta = next.losses - previous.losses;
  if (gamesDelta !== 1 || winsDelta + lossesDelta !== 1) return null;
  const versionedSingleMatch = singleMatch === undefined ? undefined : {
    schemaVersion: 1 as const,
    matchId: singleMatch.matchId,
    snapshot: singleMatch,
  } satisfies SingleMatchProgressionPayload;
  if (singleMatch !== undefined && (
    singleMatch.mode !== "singleplayer" || singleMatch.status !== "completed" ||
    !singleMatch.complete || !singleMatch.valid ||
    (singleMatch.terminationReason !== "king-captured" && singleMatch.terminationReason !== "timeout")
  )) return null;
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
      tripleBishopRollsDelta: next.tripleBishopRolls - previous.tripleBishopRolls,
      tripleRookRollsDelta: next.tripleRookRolls - previous.tripleRookRolls,
      tripleQueenRollsDelta: next.tripleQueenRolls - previous.tripleQueenRolls,
      tripleKingRollsDelta: next.tripleKingRolls - previous.tripleKingRolls,
      rollsByPieceDelta: counterDelta(next.rollsByPiece, previous.rollsByPiece),
      movesByPieceDelta: counterDelta(next.movesByPiece, previous.movesByPiece),
      capturesByPieceDelta: counterDelta(next.capturesByPiece, previous.capturesByPiece),
      ...(versionedSingleMatch ? { singleMatch: versionedSingleMatch } : {}),
    },
  };
}

export class PlayerSyncCoordinator {
  private readonly local: PlayerProfileRepository;
  private readonly remote: CloudPlayerSyncPort;
  private readonly storage?: SyncStorage;
  private readonly journal?: CompletionJournal;
  private connected = false;
  private initializing?: Promise<void>;
  private flushing?: ActiveFlush;
  private authenticationScope?: string;
  private authGeneration = 0;
  private verifiedPlayerId?: string;
  private memoryState: PlayerSyncState = EMPTY_STATE;
  private migrationSuspended = false;
  private canonicalProfileStatus: CanonicalProfileStatus = "not-applicable";
  private accountAuthenticated = false;
  private canonicalMultiplayerRating: number | null = null;
  private canonicalMultiplayerStatistics: MultiplayerStatisticsSnapshot | null = null;
  private canonicalRouletteStatistics: GlobalRouletteStatisticsSnapshot | null = null;
  private canonicalAchievementSnapshot: CloudProfileSnapshot | null = null;

  public constructor(local: PlayerProfileRepository, remote: CloudPlayerSyncPort, storage?: SyncStorage) {
    this.local = local;
    this.remote = remote;
    this.storage = storage;
    const durableStorage = storage ?? (local instanceof LocalStoragePlayerProfileRepository
      ? local.getStorage() : undefined);
    if (durableStorage) this.journal = new CompletionJournal(durableStorage);
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

  public getCanonicalMultiplayerRating(): number | null {
    return this.canonicalMultiplayerRating;
  }

  public getCanonicalMultiplayerStatistics(): MultiplayerStatisticsSnapshot | null {
    return this.canonicalMultiplayerStatistics;
  }

  public getCanonicalRouletteStatistics(): GlobalRouletteStatisticsSnapshot | null {
    return this.canonicalRouletteStatistics;
  }

  public getCanonicalAchievementSnapshot(): CloudProfileSnapshot | null {
    return this.canonicalProfileStatus === "ready" ? this.canonicalAchievementSnapshot : null;
  }

  public suspendForAccountMigration(): void {
    this.migrationSuspended = true;
  }

  public resumeAfterAccountMigrationFailure(): void {
    this.migrationSuspended = false;
  }

  public resetAfterAuthenticationSignOut(): void {
    this.invalidateAuthenticationScope();
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
    this.canonicalMultiplayerRating = null;
    this.canonicalMultiplayerStatistics = null;
    this.canonicalRouletteStatistics = null;
    this.canonicalAchievementSnapshot = null;
  }

  public async handleAuthentication(session: AuthenticationSession): Promise<void> {
    const nextScope = this.resolveAuthenticationScope(session);
    if (nextScope !== this.authenticationScope) {
      this.invalidateAuthenticationScope(nextScope);
    }
    this.accountAuthenticated = session.state.status === "authenticated";
    this.connected = session.state.status === "authenticated"
      || (session.state.status === "guest" && session.state.persistence === "cloud");
    if (!this.connected) {
      this.canonicalProfileStatus = "not-applicable";
      return;
    }
    this.canonicalProfileStatus = "loading";
    if (!this.initializing) {
      const generation = this.authGeneration;
      const initialization = this.initialize(generation).finally(() => {
        if (this.initializing === initialization) this.initializing = undefined;
      });
      this.initializing = initialization;
    }
    await this.initializing;
  }

  public recordCompletedMatch(
    before: PlayerProfile,
    after: PlayerProfile,
    singleMatch?: SingleMatchAchievementSnapshot,
  ): void {
    if (this.migrationSuspended) return;
    const state = this.readState();
    if (!state.cloudPlayerId || state.conflict) return;
    const operation = createProgressionOperation(before, after, crypto.randomUUID(), singleMatch);
    if (!operation) return;
    const pending = [...state.pending.filter((item) => item.operationId !== operation.operationId), operation];
    this.writeState({ ...state, pending });
    if (this.connected) void this.flushPending();
  }

  public recordDurableCompletedMatch(
    before: PlayerProfile,
    after: PlayerProfile,
    matchId: string,
    singleMatch: SingleMatchAchievementSnapshot,
  ): boolean {
    const state = this.readState();
    if (this.migrationSuspended) return false;
    if (this.connected && (!state.cloudPlayerId || state.conflict)) {
      throw new Error("Canonical completion owner is not available yet.");
    }
    if (!state.cloudPlayerId || state.conflict) return false;
    if (this.verifiedPlayerId !== state.cloudPlayerId) {
      throw new Error("Completion owner has not been verified for this authentication session.");
    }
    if (!this.journal || !(this.local instanceof LocalStoragePlayerProfileRepository)) {
      throw new Error("Durable completion storage is unavailable.");
    }
    if (after.playerId !== state.cloudPlayerId || before.playerId !== state.cloudPlayerId
        || singleMatch.playerId !== state.cloudPlayerId || singleMatch.matchId !== matchId) {
      throw new Error("Completion owner or match identity does not match the canonical player.");
    }
    const operation = createProgressionOperation(before, after, crypto.randomUUID(), singleMatch);
    if (!operation) throw new Error("Completed match cannot produce a valid cloud operation.");
    const entry: CompletionEntry = {
      schemaVersion: 1, matchId, ownerPlayerId: state.cloudPlayerId,
      operation, profile: structuredClone(after), acknowledged: false,
      result: { won: singleMatch.winner === singleMatch.playerColor,
        terminationReason: singleMatch.terminationReason as "king-captured" | "timeout",
        xpAwarded: after.totalXp - before.totalXp },
    };
    const durableEntry = this.journal.append(entry);
    this.local.saveProfileDurably(after);
    this.writeStateDurably({ ...state, pending: state.pending.some((item) =>
      item.operationId === durableEntry.operation.operationId)
      ? state.pending : [...state.pending, durableEntry.operation] });
    if (this.connected) void this.flushPending();
    return true;
  }

  public async reconnect(): Promise<void> {
    if (!this.connected) return;
    const generation = this.authGeneration;
    const activeFlush = this.flushing?.promise;
    if (activeFlush) await activeFlush;
    if (!this.isGenerationCurrent(generation)) return;
    await this.flushPending();
    if (!this.isGenerationCurrent(generation)) return;
    const state = this.readState();
    if (!state.cloudPlayerId || state.conflict || state.pending.length > 0) return;
    const canonical = await this.remote.loadCurrent();
    if (!this.isContextCurrent({ generation, playerId: state.cloudPlayerId })) return;
    if (canonical.playerId !== state.cloudPlayerId) {
      this.canonicalProfileStatus = "unavailable";
      return;
    }
    this.local.saveProfile(canonical.profile);
    this.canonicalMultiplayerRating = canonical.multiplayerRating;
    this.canonicalMultiplayerStatistics = canonical.multiplayerStatistics;
    this.canonicalRouletteStatistics = canonical.rouletteStatistics;
    this.canonicalProfileStatus = "ready";
    this.canonicalAchievementSnapshot = canonical;
  }

  public async flushPending(): Promise<void> {
    const state = this.readState();
    if (!state.cloudPlayerId || state.conflict || !this.connected
        || this.verifiedPlayerId !== state.cloudPlayerId) return;
    const context = { generation: this.authGeneration, playerId: state.cloudPlayerId };
    if (!this.flushing || !this.sameContext(this.flushing.context, context)) {
      const active: ActiveFlush = {
        context,
        promise: Promise.resolve(),
      };
      active.promise = this.flush(context).finally(() => {
        if (this.flushing === active) this.flushing = undefined;
      });
      this.flushing = active;
    }
    await this.flushing.promise;
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
    this.invalidateAuthenticationScope(this.authenticationScope);
    const generation = this.authGeneration;
    const canonical = await this.remote.loadCurrent();
    if (generation !== this.authGeneration) {
      throw new Error("Authentication changed during canonical profile adoption.");
    }
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
    this.canonicalMultiplayerRating = canonical.multiplayerRating;
    this.canonicalMultiplayerStatistics = canonical.multiplayerStatistics;
    this.canonicalRouletteStatistics = canonical.rouletteStatistics;
    this.connected = true;
    this.canonicalAchievementSnapshot = canonical;
    this.verifiedPlayerId = canonical.playerId;
    this.migrationSuspended = false;
    this.canonicalProfileStatus = "ready";
    return canonical;
  }

  public async renameCurrentPlayer(displayName: string): Promise<CloudProfileSnapshot> {
    const before = this.local.getProfile();
    const state = this.readState();
    const context = state.cloudPlayerId ? { generation: this.authGeneration, playerId: state.cloudPlayerId } : null;
    if (!this.accountAuthenticated || !this.connected || this.canonicalProfileStatus !== "ready"
        || !state.cloudPlayerId || state.conflict || this.migrationSuspended) {
      throw new Error("Canonical account profile is unavailable.");
    }
    const canonical = await this.remote.renameCurrentPlayer(displayName);
    if (!context || !this.isContextCurrent(context) || canonical.playerId !== before.playerId
        || canonical.profile.publicDiscriminator !== before.publicDiscriminator) {
      throw new Error("Identity changed during username update.");
    }
    this.local.saveProfile(canonical.profile);
    this.canonicalMultiplayerRating = canonical.multiplayerRating;
    this.canonicalMultiplayerStatistics = canonical.multiplayerStatistics;
    this.canonicalRouletteStatistics = canonical.rouletteStatistics;
    this.canonicalAchievementSnapshot = canonical;
    return canonical;
  }

  private async initialize(generation: number): Promise<void> {
    try {
      const cloud = await this.remote.loadCurrent();
      if (!this.isGenerationCurrent(generation)) return;
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
      const hasUnacknowledgedCompletion = this.journal?.read().some((entry) =>
        entry.ownerPlayerId === cloud.playerId && !entry.acknowledged) ?? false;
      if (!knownCloud && !isMeaningfulCloudProfile(cloud) && isMeaningfulLocalProfile(local)
          && bootstrapOwnsCanonicalIdentity && !hasUnacknowledgedCompletion) {
        canonical = await this.remote.bootstrap(local);
        if (!this.isGenerationCurrent(generation)) return;
      }
      this.writeState({
        ...state,
        cloudPlayerId: canonical.playerId,
        bootstrapSourceProfileId: this.accountAuthenticated
          ? canonical.playerId
          : state.bootstrapSourceProfileId ?? local.playerId,
        conflict: false,
      });
      this.canonicalMultiplayerRating = canonical.multiplayerRating;
      this.verifiedPlayerId = canonical.playerId;
      this.canonicalMultiplayerStatistics = canonical.multiplayerStatistics;
      this.canonicalRouletteStatistics = canonical.rouletteStatistics;
      this.recoverCompletions(canonical);
      this.canonicalAchievementSnapshot = canonical;
      if (this.readState().pending.length > 0) {
        await this.flushPending();
        if (!this.isGenerationCurrent(generation)) return;
      } else {
        this.local.saveProfile(canonical.profile);
      }
      this.canonicalProfileStatus = "ready";
    } catch {
      if (!this.isGenerationCurrent(generation)) return;
      this.canonicalProfileStatus = "unavailable";
      // Local profile remains usable; reconnect or the next match retries safely.
    }
  }

  private async flush(context: SyncContext): Promise<void> {
    let state = this.readState();
    if (!this.isContextCurrent(context) || state.conflict) return;
    let canonical: CloudProfileSnapshot | undefined;
    for (const operation of state.pending) {
      try {
        if (!this.isContextCurrent(context)) return;
        canonical = await this.remote.applyOperation(operation);
        if (!this.isContextCurrent(context)) return;
        if (canonical.playerId !== context.playerId) return;
        this.journal?.acknowledge(operation.operationId, context.playerId);
        state = this.readState();
        this.writeStateDurably({ ...state, pending: state.pending.filter((item) => item.operationId !== operation.operationId) });
        this.journal?.pruneAcknowledged(context.playerId);
      } catch {
        return;
      }
    }
    if (canonical && this.isContextCurrent(context)) {
      if (this.readState().pending.length === 0) this.local.saveProfile(canonical.profile);
      this.canonicalMultiplayerRating = canonical.multiplayerRating;
      this.canonicalMultiplayerStatistics = canonical.multiplayerStatistics;
      this.canonicalRouletteStatistics = canonical.rouletteStatistics;
    }
    if (canonical) this.canonicalAchievementSnapshot = canonical;
  }

  private resolveAuthenticationScope(session: AuthenticationSession): string | undefined {
    if (session.state.status === "authenticated") {
      return `account:${session.state.account.accountId}`;
    }
    if (session.state.status === "guest" && session.state.persistence === "cloud") {
      return `guest:${session.state.guestSessionId}`;
    }
    return undefined;
  }

  private invalidateAuthenticationScope(nextScope?: string): void {
    this.authGeneration += 1;
    this.authenticationScope = nextScope;
    this.initializing = undefined;
    this.flushing = undefined;
    this.verifiedPlayerId = undefined;
    this.canonicalAchievementSnapshot = null;
  }

  private isGenerationCurrent(generation: number): boolean {
    return this.connected && generation === this.authGeneration;
  }

  private isContextCurrent(context: SyncContext): boolean {
    const state = this.readState();
    return this.isGenerationCurrent(context.generation)
      && state.cloudPlayerId === context.playerId;
  }

  private sameContext(left: SyncContext, right: SyncContext): boolean {
    return left.generation === right.generation && left.playerId === right.playerId;
  }

  private recoverCompletions(cloud: CloudProfileSnapshot): void {
    if (!this.journal) return;
    const entries = this.journal.read().filter((entry) =>
      entry.ownerPlayerId === cloud.playerId && !entry.acknowledged);
    if (entries.length === 0) return;
    const state = this.readState();
    if (state.cloudPlayerId !== cloud.playerId || state.conflict) return;
    const pending = [...state.pending];
    for (const entry of entries) {
      if (!pending.some((operation) => operation.operationId === entry.operation.operationId)) {
        pending.push(entry.operation);
      }
    }
    this.writeStateDurably({ ...state, pending });
    const current = this.local.getProfile();
    if (current.playerId !== cloud.playerId) return;
    for (const entry of entries) {
      const profile = this.local.getProfile();
      if (profile.statistics.gamesPlayed < entry.profile.statistics.gamesPlayed
          && cloud.profile.statistics.gamesPlayed < entry.profile.statistics.gamesPlayed) {
        if (!(this.local instanceof LocalStoragePlayerProfileRepository)) {
          throw new Error("Durable profile recovery is unavailable.");
        }
        this.local.saveProfileDurably(entry.profile);
      }
    }
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

  private writeStateDurably(state: PlayerSyncState): void {
    if (!this.storage) throw new Error("Durable sync storage is unavailable.");
    this.storage.setItem(PLAYER_SYNC_STORAGE_KEY, JSON.stringify(state));
    this.memoryState = state;
  }
}
