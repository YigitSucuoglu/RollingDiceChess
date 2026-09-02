import {
  PLAYER_PROFILE_SCHEMA_VERSION,
  PLAYER_PROFILE_STORAGE_KEY,
  PROFILE_PIECE_ORDER,
  createDefaultPlayerProfile,
  type PieceCounters,
  type PlayerProfile,
  type PlayerStatistics,
} from "./PlayerProfile";
import type { PlayerProfileRepository } from "./PlayerProfileRepository";

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const fallbackValues = new Map<string, string>();
const FALLBACK_STORAGE: StorageAdapter = {
  getItem: (key) => fallbackValues.get(key) ?? null,
  setItem: (key, value) => fallbackValues.set(key, value),
  removeItem: (key) => fallbackValues.delete(key),
};

function getDefaultStorage(): StorageAdapter {
  try {
    return typeof window === "undefined"
      ? FALLBACK_STORAGE
      : window.localStorage;
  } catch {
    return FALLBACK_STORAGE;
  }
}

function nonNegativeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function migratePieceCounters(
  value: unknown,
  fallback: PieceCounters
): PieceCounters {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const counters = { ...fallback };

  for (const pieceType of PROFILE_PIECE_ORDER) {
    counters[pieceType] = nonNegativeNumber(source[pieceType]);
  }

  return counters;
}

function migrateStatistics(
  value: unknown,
  fallback: PlayerStatistics
): PlayerStatistics {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};

  return {
    gamesPlayed: nonNegativeNumber(source.gamesPlayed),
    wins: nonNegativeNumber(source.wins),
    losses: nonNegativeNumber(source.losses),
    currentWinStreak: nonNegativeNumber(source.currentWinStreak),
    bestWinStreak: nonNegativeNumber(source.bestWinStreak),
    totalPlayTimeSeconds: nonNegativeNumber(source.totalPlayTimeSeconds),
    kingsCaptured: nonNegativeNumber(source.kingsCaptured),
    rouletteRolls: nonNegativeNumber(source.rouletteRolls),
    rollsByPiece: migratePieceCounters(
      source.rollsByPiece,
      fallback.rollsByPiece
    ),
    movesByPiece: migratePieceCounters(
      source.movesByPiece,
      fallback.movesByPiece
    ),
    capturesByPiece: migratePieceCounters(
      source.capturesByPiece,
      fallback.capturesByPiece
    ),
    playerTurnsCompleted: nonNegativeNumber(source.playerTurnsCompleted),
    threeRightsTurns: nonNegativeNumber(source.threeRightsTurns),
    triplePawnRolls: nonNegativeNumber(source.triplePawnRolls),
    tripleKnightRolls: nonNegativeNumber(source.tripleKnightRolls),
    tripleBishopRolls: nonNegativeNumber(source.tripleBishopRolls),
    tripleRookRolls: nonNegativeNumber(source.tripleRookRolls),
    tripleQueenRolls: nonNegativeNumber(source.tripleQueenRolls),
    tripleKingRolls: nonNegativeNumber(source.tripleKingRolls),
  };
}

export class LocalStoragePlayerProfileRepository
  implements PlayerProfileRepository
{
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter = getDefaultStorage()) {
    this.storage = storage;
  }

  public getProfile(): PlayerProfile {
    const fallback = createDefaultPlayerProfile();

    try {
      const serialized = this.storage.getItem(PLAYER_PROFILE_STORAGE_KEY);

      if (!serialized) {
        this.saveProfile(fallback);
        return fallback;
      }

      const migrated = this.migrate(JSON.parse(serialized), fallback);
      this.saveProfile(migrated);
      return migrated;
    } catch {
      this.saveProfile(fallback);
      return fallback;
    }
  }

  public saveProfile(profile: PlayerProfile): void {
    try {
      this.storage.setItem(
        PLAYER_PROFILE_STORAGE_KEY,
        JSON.stringify(profile)
      );
    } catch {
      // Persistence failure must not make gameplay or Profile unavailable.
    }
  }

  public resetProfile(): PlayerProfile {
    try {
      this.storage.removeItem(PLAYER_PROFILE_STORAGE_KEY);
    } catch {
      // Keep reset usable in memory when persistent storage is blocked.
    }
    const profile = createDefaultPlayerProfile();
    this.saveProfile(profile);
    return profile;
  }

  private migrate(value: unknown, fallback: PlayerProfile): PlayerProfile {
    if (typeof value !== "object" || value === null) {
      return fallback;
    }

    const source = value as Record<string, unknown>;
    const schemaVersion = nonNegativeNumber(source.schemaVersion);

    if (schemaVersion > PLAYER_PROFILE_SCHEMA_VERSION) {
      return fallback;
    }

    return {
      schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION,
      playerId:
        typeof source.playerId === "string" && source.playerId
          ? source.playerId
          : fallback.playerId,
      displayName:
        typeof source.displayName === "string" && source.displayName.trim()
          ? source.displayName.trim()
          : fallback.displayName,
      publicDiscriminator:
        typeof source.publicDiscriminator === "string"
          && /^[A-Z0-9]{5}$/.test(source.publicDiscriminator)
          ? source.publicDiscriminator
          : null,
      usernameOnboardingRequired:
        source.usernameOnboardingRequired === true,
      createdAt:
        typeof source.createdAt === "string" &&
        !Number.isNaN(Date.parse(source.createdAt))
          ? source.createdAt
          : fallback.createdAt,
      totalXp: nonNegativeNumber(source.totalXp),
      statistics: migrateStatistics(
        source.statistics,
        fallback.statistics
      ),
      processedMatchIds: Array.isArray(source.processedMatchIds)
        ? source.processedMatchIds.filter(
            (id): id is string => typeof id === "string"
          )
        : [],
    };
  }
}
