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
import {
  calculateLevelProgression,
  createMatchXpProgressionResult,
  calculateXpReward,
  resolvePlayerTitle,
  type MatchXpProgressionResult,
  type XpRewardBreakdown,
} from "./ProfileProgression";

const MAX_PROCESSED_MATCH_IDS = 100;

export interface PlayerProfileViewModel {
  readonly displayName: string;
  readonly monogram: string;
  readonly joinedLabel: string;
  readonly progression: {
    readonly level: number;
    readonly title: string;
    readonly currentLevelXp: number;
    readonly requiredXp: number;
    readonly progressPercent: number;
  };
  readonly generalStats: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly rouletteStats: {
    readonly mostRolledPiece: string;
    readonly mostPlayedPiece: string;
    readonly mostSuccessfulPiece: string;
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

function formatPercentage(value: number): string {
  const percentage = Math.max(0, value * 100);
  const rounded =
    Math.abs(percentage - Math.round(percentage)) < 0.05
      ? Math.round(percentage).toString()
      : percentage.toFixed(1);

  return `${rounded}%`;
}

function formatPlayTime(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);

  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
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

  constructor(
    repository: PlayerProfileRepository =
      new LocalStoragePlayerProfileRepository()
  ) {
    this.repository = repository;
  }

  public getProfile(): PlayerProfile {
    return this.repository.getProfile();
  }

  public getViewModel(): PlayerProfileViewModel {
    const profile = this.repository.getProfile();
    const stats = profile.statistics;
    const progression = calculateLevelProgression(profile.totalXp);
    const nameParts = profile.displayName.trim().split(/\s+/);
    const monogram = nameParts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");

    return {
      displayName: profile.displayName,
      monogram: monogram || "P",
      joinedLabel: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(new Date(profile.createdAt)),
      progression: {
        ...progression,
        title: resolvePlayerTitle(progression.level),
      },
      generalStats: [
        { label: "Games Played", value: stats.gamesPlayed.toString() },
        { label: "Wins", value: stats.wins.toString() },
        { label: "Losses", value: stats.losses.toString() },
        {
          label: "Win Rate",
          value: formatPercentage(
            stats.gamesPlayed > 0 ? stats.wins / stats.gamesPlayed : 0
          ),
        },
        {
          label: "Current Win Streak",
          value: stats.currentWinStreak.toString(),
        },
        {
          label: "Best Win Streak",
          value: stats.bestWinStreak.toString(),
        },
        {
          label: "Total Play Time",
          value: formatPlayTime(stats.totalPlayTimeSeconds),
        },
        {
          label: "Kings Captured",
          value: stats.kingsCaptured.toString(),
        },
        {
          label: "Roulette Rolls",
          value: stats.rouletteRolls.toString(),
        },
      ],
      rouletteStats: {
        mostRolledPiece: formatPiece(
          resolveMostFrequent(stats.rollsByPiece)
        ),
        mostPlayedPiece: formatPiece(
          resolveMostFrequent(stats.movesByPiece)
        ),
        mostSuccessfulPiece: formatPiece(
          resolveMostFrequent(stats.capturesByPiece)
        ),
        threeRightsUsedLabel: formatPercentage(
          stats.playerTurnsCompleted > 0
            ? stats.threeRightsTurns / stats.playerTurnsCompleted
            : 0
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
    if (session.completionResult) {
      return null;
    }

    const profile = this.repository.getProfile();

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
