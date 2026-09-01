import type {
  GameCompletedEvent,
  GameEventSink,
  GameMoveEvent,
} from "../engine/GameEvents";
import type { PieceColor, PieceType } from "../types/Chess";
import type { GameSetup } from "../types/GameSetup";
import { LocalStoragePlayerProfileRepository } from "./LocalStoragePlayerProfileRepository";
import {
  PROFILE_PIECE_ORDER,
  createPieceCounters,
  type PieceCounters,
  type PlayerProfile,
} from "./PlayerProfile";
import type { PlayerProfileRepository } from "./PlayerProfileRepository";
import type { AuthenticationSession } from "../application/auth/AuthenticationContracts";
import { normalizeAccountDisplayName } from "../application/players/PlayerContracts";
import { PlayerSyncCoordinator, type CanonicalProfileStatus, type CloudPlayerSyncPort, type MultiplayerStatisticsSnapshot } from "./PlayerSync";
import {
  calculateLevelProgression,
  createMatchXpProgressionResult,
  calculateXpReward,
  resolvePlayerTitle,
  resolvePlayerTitleId,
  type PlayerTitleId,
  type MatchXpProgressionResult,
  type XpRewardBreakdown,
} from "./ProfileProgression";

const MAX_PROCESSED_MATCH_IDS = 100;

export interface PlayerProfileViewModel {
  readonly displayName: string;
  readonly publicDiscriminator: string | null;
  readonly usernameOnboardingRequired: boolean;
  readonly multiplayerRating: number | null;
  readonly multiplayerStatistics: MultiplayerStatisticsSnapshot | null;
  readonly monogram: string;
  readonly joinedLabel: string;
  readonly progression: {
    readonly level: number;
    readonly title: string;
    readonly titleId: PlayerTitleId;
    readonly currentLevelXp: number;
    readonly requiredXp: number;
    readonly progressPercent: number;
  };
  readonly generalStats: readonly {
    readonly label: string;
    readonly id: string;
    readonly value: string;
  }[];
  readonly rouletteStats: {
    readonly mostRolledPiece: string;
    readonly mostPlayedPiece: string;
    readonly mostSuccessfulPiece: string;
    readonly mostRolledPieceType: PieceType | null;
    readonly mostPlayedPieceType: PieceType | null;
    readonly mostSuccessfulPieceType: PieceType | null;
    readonly threeRightsUsedLabel: string;
    readonly triplePawnRolls: number;
    readonly tripleKnightRolls: number;
    readonly tripleQueenRolls: number;
  };
}

interface MatchSession {
  readonly matchId: string;
  readonly startedAtMs: number;
  readonly setup: GameSetup;
  promotions: number;
  rouletteRolls: number;
  rollsByPiece: PieceCounters;
  movesByPiece: PieceCounters;
  capturesByPiece: PieceCounters;
  playerTurnsCompleted: number;
  threeRightsTurns: number;
  triplePawnRolls: number;
  tripleKnightRolls: number;
  tripleQueenRolls: number;
  completionResult: MatchXpProgressionResult | null;
}

export interface ProfileGameSession {
  readonly eventSink: GameEventSink;
  getXpProgressionResult(): MatchXpProgressionResult | null;
}

function createMatchId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `match-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatPercentage(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(Math.max(0, value));
}

function formatPlayTime(totalSeconds: number, language: "en" | "tr"): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);

  if (minutes < 60) return language === "tr" ? `${minutes} dk` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return language === "tr" ? `${hours} sa ${minutes % 60} dk` : `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return language === "tr" ? `${days} gün ${hours % 24} sa` : `${days}d ${hours % 24}h`;
}

function resolveMostFrequent(counters: PieceCounters): PieceType | null {
  let bestPiece: PieceType | null = null;
  let bestCount = 0;

  for (const pieceType of PROFILE_PIECE_ORDER) {
    if (counters[pieceType] > bestCount) {
      bestPiece = pieceType;
      bestCount = counters[pieceType];
    }
  }

  return bestPiece;
}

function formatPiece(pieceType: PieceType | null): string {
  return pieceType
    ? `${pieceType.charAt(0).toUpperCase()}${pieceType.slice(1)}`
    : "—";
}

export class PlayerProfileService {
  private readonly repository: PlayerProfileRepository;
  private readonly listeners = new Set<() => void>();
  private sync?: PlayerSyncCoordinator;

  constructor(
    repository: PlayerProfileRepository =
      new LocalStoragePlayerProfileRepository()
  ) {
    this.repository = repository;
  }

  public getProfile(): PlayerProfile {
    return this.repository.getProfile();
  }

  public configureCloudSync(remote: CloudPlayerSyncPort, storage?: Storage): void {
    if (!this.sync) this.sync = new PlayerSyncCoordinator(this.repository, remote, storage);
  }

  public async handleAuthenticationSession(session: AuthenticationSession): Promise<void> {
    const operation = this.sync?.handleAuthentication(session);
    this.notify();
    await operation;
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getCanonicalProfileStatus(): CanonicalProfileStatus {
    return this.sync?.getCanonicalProfileStatus() ?? "not-applicable";
  }

  public async renameCurrentAccount(requestedName: string): Promise<PlayerProfileViewModel> {
    const displayName = normalizeAccountDisplayName(requestedName);
    if (!this.sync) throw new Error("Account profile is unavailable.");
    await this.sync.renameCurrentPlayer(displayName);
    this.notify();
    return this.getViewModel();
  }

  public async reconnectCloudSync(): Promise<void> {
    await this.sync?.reconnect();
    this.notify();
  }

  public isCloudProfileEstablished(): boolean {
    return this.sync?.isCloudCanonical() ?? false;
  }

  public hasProfileSyncConflict(): boolean {
    return this.sync?.hasConflict() ?? false;
  }

  public async prepareForAccountMigration(): Promise<boolean> {
    return this.sync?.prepareForAccountMigration() ?? false;
  }

  public suspendForAccountMigration(): void {
    this.sync?.suspendForAccountMigration();
  }

  public isAccountMigrationSuspended(): boolean {
    return this.sync?.isAccountMigrationSuspended() ?? false;
  }

  public resumeAfterAccountMigrationFailure(): void {
    this.sync?.resumeAfterAccountMigrationFailure();
  }

  public resetAfterAuthenticationSignOut(): void {
    this.sync?.resetAfterAuthenticationSignOut();
    this.notify();
  }

  public async adoptCanonicalAfterAccountMigration(expectedPlayerId?: string): Promise<void> {
    await this.sync?.adoptCanonicalAfterAccountMigration(expectedPlayerId);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  public resetProfile(): PlayerProfileViewModel {
    if (this.isCloudProfileEstablished()) return this.getViewModel();
    this.repository.resetProfile();
    return this.getViewModel();
  }

  public getViewModel(language: "en" | "tr" = "en"): PlayerProfileViewModel {
    const profile = this.repository.getProfile();
    const stats = profile.statistics;
    const progression = calculateLevelProgression(profile.totalXp);
    const nameParts = profile.displayName.trim().split(/\s+/);
    const monogram = nameParts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");

    const locale = language === "tr" ? "tr-TR" : "en-US";
    const number = (value: number) => new Intl.NumberFormat(locale).format(value);
    const mostRolledPieceType = resolveMostFrequent(stats.rollsByPiece);
    const mostPlayedPieceType = resolveMostFrequent(stats.movesByPiece);
    const mostSuccessfulPieceType = resolveMostFrequent(stats.capturesByPiece);
    return {
      displayName: profile.displayName,
      publicDiscriminator: profile.publicDiscriminator,
      usernameOnboardingRequired: profile.usernameOnboardingRequired,
      multiplayerRating: this.sync?.getCanonicalMultiplayerRating() ?? null,
      multiplayerStatistics: this.sync?.getCanonicalMultiplayerStatistics() ?? null,
      monogram: monogram || "P",
      joinedLabel: new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(new Date(profile.createdAt)),
      progression: {
        ...progression,
        title: resolvePlayerTitle(progression.level),
        titleId: resolvePlayerTitleId(progression.level),
      },
      generalStats: [
        { id: "gamesPlayed", label: "Games Played", value: number(stats.gamesPlayed) },
        { id: "wins", label: "Wins", value: number(stats.wins) },
        { id: "losses", label: "Losses", value: number(stats.losses) },
        {
          id: "winRate", label: "Win Rate",
          value: formatPercentage(
            stats.gamesPlayed > 0 ? stats.wins / stats.gamesPlayed : 0, locale
          ),
        },
        {
          id: "currentWinStreak", label: "Current Win Streak",
          value: number(stats.currentWinStreak),
        },
        {
          id: "bestWinStreak", label: "Best Win Streak",
          value: number(stats.bestWinStreak),
        },
        {
          id: "totalPlayTime", label: "Total Play Time",
          value: formatPlayTime(stats.totalPlayTimeSeconds, language),
        },
        {
          id: "kingsCaptured", label: "Kings Captured",
          value: number(stats.kingsCaptured),
        },
        {
          id: "rouletteRolls", label: "Roulette Rolls",
          value: number(stats.rouletteRolls),
        },
      ],
      rouletteStats: {
        mostRolledPiece: formatPiece(
          mostRolledPieceType
        ),
        mostPlayedPiece: formatPiece(
          mostPlayedPieceType
        ),
        mostSuccessfulPiece: formatPiece(
          mostSuccessfulPieceType
        ),
        mostRolledPieceType,
        mostPlayedPieceType,
        mostSuccessfulPieceType,
        threeRightsUsedLabel: formatPercentage(
          stats.playerTurnsCompleted > 0
            ? stats.threeRightsTurns / stats.playerTurnsCompleted
            : 0, locale
        ),
        triplePawnRolls: stats.triplePawnRolls,
        tripleKnightRolls: stats.tripleKnightRolls,
        tripleQueenRolls: stats.tripleQueenRolls,
      },
    };
  }

  public createGameSession(setup: GameSetup): ProfileGameSession {
    const session: MatchSession = {
      matchId: createMatchId(),
      startedAtMs: Date.now(),
      setup,
      promotions: 0,
      rouletteRolls: 0,
      rollsByPiece: createPieceCounters(),
      movesByPiece: createPieceCounters(),
      capturesByPiece: createPieceCounters(),
      playerTurnsCompleted: 0,
      threeRightsTurns: 0,
      triplePawnRolls: 0,
      tripleKnightRolls: 0,
      tripleQueenRolls: 0,
      completionResult: null,
    };

    const eventSink: GameEventSink = {
      onRoll: (color, roll) => this.recordRoll(session, color, roll),
      onMove: (event) => this.recordMove(session, event),
      onTurnCompleted: (color, movesUsed) =>
        this.recordTurnCompletion(session, color, movesUsed),
      onGameCompleted: (event) => this.completeMatch(session, event),
    };

    return {
      eventSink,
      getXpProgressionResult: () => session.completionResult,
    };
  }

  public createGameEventSink(setup: GameSetup): GameEventSink {
    return this.createGameSession(setup).eventSink;
  }

  public completeMatch(
    session: MatchSession,
    event: GameCompletedEvent,
    completedAtMs: number = Date.now()
  ): XpRewardBreakdown | null {
    if (this.isAccountMigrationSuspended()) return null;
    if (session.completionResult) {
      return null;
    }

    const profile = this.repository.getProfile();
    const profileBeforeMatch = structuredClone(profile);

    if (profile.processedMatchIds.includes(session.matchId)) {
      return null;
    }

    const won = event.winner === session.setup.playerColor;
    const nextWinStreak = won
      ? profile.statistics.currentWinStreak + 1
      : 0;
    const reward = calculateXpReward({
      won,
      promotions: session.promotions,
      currentWinStreak: nextWinStreak,
      difficulty: session.setup.botDifficulty,
    });
    const stats = profile.statistics;

    stats.gamesPlayed++;
    stats.wins += won ? 1 : 0;
    stats.losses += won ? 0 : 1;
    stats.currentWinStreak = nextWinStreak;
    stats.bestWinStreak = Math.max(stats.bestWinStreak, nextWinStreak);
    stats.totalPlayTimeSeconds += Math.max(
      0,
      Math.round((completedAtMs - session.startedAtMs) / 1000)
    );
    stats.kingsCaptured +=
      won && event.reason === "king-captured" ? 1 : 0;
    stats.rouletteRolls += session.rouletteRolls;
    stats.playerTurnsCompleted += session.playerTurnsCompleted;
    stats.threeRightsTurns += session.threeRightsTurns;
    stats.triplePawnRolls += session.triplePawnRolls;
    stats.tripleKnightRolls += session.tripleKnightRolls;
    stats.tripleQueenRolls += session.tripleQueenRolls;

    for (const pieceType of PROFILE_PIECE_ORDER) {
      stats.rollsByPiece[pieceType] += session.rollsByPiece[pieceType];
      stats.movesByPiece[pieceType] += session.movesByPiece[pieceType];
      stats.capturesByPiece[pieceType] +=
        session.capturesByPiece[pieceType];
    }

    const previousTotalXp = profile.totalXp;
    profile.totalXp += reward.finalXp;
    profile.processedMatchIds = [
      ...profile.processedMatchIds,
      session.matchId,
    ].slice(-MAX_PROCESSED_MATCH_IDS);
    this.repository.saveProfile(profile);
    this.sync?.recordCompletedMatch(profileBeforeMatch, profile);
    session.completionResult = createMatchXpProgressionResult(
      previousTotalXp,
      reward.finalXp
    );

    return reward;
  }

  private recordRoll(
    session: MatchSession,
    color: PieceColor,
    roll: readonly PieceType[]
  ): void {
    if (color !== session.setup.playerColor) return;

    session.rouletteRolls++;
    for (const pieceType of roll) session.rollsByPiece[pieceType]++;

    if (roll.every((pieceType) => pieceType === "pawn")) {
      session.triplePawnRolls++;
    } else if (roll.every((pieceType) => pieceType === "knight")) {
      session.tripleKnightRolls++;
    } else if (roll.every((pieceType) => pieceType === "queen")) {
      session.tripleQueenRolls++;
    }
  }

  private recordMove(session: MatchSession, event: GameMoveEvent): void {
    if (event.color !== session.setup.playerColor) return;

    session.movesByPiece[event.pieceType]++;
    if (event.isCapture) session.capturesByPiece[event.pieceType]++;
    if (event.isPromotion) session.promotions++;
  }

  private recordTurnCompletion(
    session: MatchSession,
    color: PieceColor,
    movesUsed: number
  ): void {
    if (color !== session.setup.playerColor || movesUsed === 0) return;

    session.playerTurnsCompleted++;
    if (movesUsed === 3) session.threeRightsTurns++;
  }
}

const playerProfileService = new PlayerProfileService();

export default playerProfileService;
