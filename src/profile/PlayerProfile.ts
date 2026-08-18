import type { PieceType } from "../types/Chess";

export const PLAYER_PROFILE_SCHEMA_VERSION = 1;
export const PLAYER_PROFILE_STORAGE_KEY =
  "roulettechess.player-profile.v1";

export const PROFILE_PIECE_ORDER: readonly PieceType[] = [
  "pawn",
  "knight",
  "bishop",
  "rook",
  "queen",
  "king",
];

export type PieceCounters = Record<PieceType, number>;

export interface PlayerStatistics {
  gamesPlayed: number;
  wins: number;
  losses: number;
  currentWinStreak: number;
  bestWinStreak: number;
  totalPlayTimeSeconds: number;
  kingsCaptured: number;
  rouletteRolls: number;
  rollsByPiece: PieceCounters;
  movesByPiece: PieceCounters;
  capturesByPiece: PieceCounters;
  playerTurnsCompleted: number;
  threeRightsTurns: number;
  triplePawnRolls: number;
  tripleKnightRolls: number;
  tripleQueenRolls: number;
}

export interface PlayerProfile {
  schemaVersion: number;
  playerId: string;
  displayName: string;
  publicDiscriminator: string | null;
  usernameOnboardingRequired: boolean;
  createdAt: string;
  totalXp: number;
  statistics: PlayerStatistics;
  processedMatchIds: string[];
}

export function createPieceCounters(): PieceCounters {
  return {
    pawn: 0,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
    king: 0,
  };
}

function createPlayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createDefaultPlayerProfile(
  now: Date = new Date()
): PlayerProfile {
  return {
    schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION,
    playerId: createPlayerId(),
    displayName: "Player",
    publicDiscriminator: null,
    usernameOnboardingRequired: false,
    createdAt: now.toISOString(),
    totalXp: 0,
    statistics: {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      totalPlayTimeSeconds: 0,
      kingsCaptured: 0,
      rouletteRolls: 0,
      rollsByPiece: createPieceCounters(),
      movesByPiece: createPieceCounters(),
      capturesByPiece: createPieceCounters(),
      playerTurnsCompleted: 0,
      threeRightsTurns: 0,
      triplePawnRolls: 0,
      tripleKnightRolls: 0,
      tripleQueenRolls: 0,
    },
    processedMatchIds: [],
  };
}
