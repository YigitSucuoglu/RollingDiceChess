import type { AccountId } from "../auth/AuthenticationContracts";

export const CLOUD_PLAYER_SCHEMA_VERSION = 1;
export const DEFAULT_MULTIPLAYER_RATING = 1000;
export const DISPLAY_NAME_MAX_LENGTH = 24;

declare const playerIdBrand: unique symbol;
export type PlayerId = string & { readonly [playerIdBrand]: true };

export type PlayerOwnership =
  | { readonly kind: "guest" }
  | { readonly kind: "account"; readonly accountId: AccountId };

export interface PlayerProgressionSnapshot {
  readonly totalXp: number;
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
}

export interface PlayerRatingSnapshot {
  readonly multiplayerRating: number;
  readonly ratedGames: number;
  readonly ratingVersion: number;
}

export interface CloudPlayerProfile {
  readonly schemaVersion: typeof CLOUD_PLAYER_SCHEMA_VERSION;
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly ownership: PlayerOwnership;
  readonly lifecycle: "active" | "retired";
  readonly progression: PlayerProgressionSnapshot;
  readonly rating: PlayerRatingSnapshot;
}

export interface LocalProfileBootstrapCandidate {
  readonly sourceProfileId: string;
  readonly sourceSchemaVersion: number;
  readonly displayName: string;
  readonly progression: PlayerProgressionSnapshot;
}

export type ProfileConflictResolution =
  | "USE_GOOGLE_PROFILE"
  | "USE_GUEST_PROFILE";

export interface PlayerProfileConflict {
  readonly status: "profile-conflict";
  readonly conflictId: string;
  readonly guest: CloudPlayerProfile;
  readonly google: CloudPlayerProfile;
}

export function toPlayerId(value: string): PlayerId {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new Error("PlayerId must contain between 1 and 128 characters.");
  }
  return normalized as PlayerId;
}

export function normalizeDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Error(`Display name must contain between 2 and ${DISPLAY_NAME_MAX_LENGTH} characters.`);
  }
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (/[/\\<>]/u.test(normalized) || containsControlCharacter) {
    throw new Error("Display name contains unsupported characters.");
  }
  return normalized;
}

export function createGuestDisplayName(randomValue: number = Math.random()): string {
  const safeRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 0.999999999)
    : 0;
  return `Guest${Math.floor(safeRandom * 10_000).toString().padStart(4, "0")}`;
}
