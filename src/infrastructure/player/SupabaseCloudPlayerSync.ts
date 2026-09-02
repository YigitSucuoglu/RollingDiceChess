import type { SupabaseClient } from "@supabase/supabase-js";

import type { PieceCounters, PlayerProfile, PlayerStatistics } from "../../profile/PlayerProfile";
import { createPieceCounters } from "../../profile/PlayerProfile";
import type { CloudPlayerSyncPort, CloudProfileSnapshot, ProgressionOperation } from "../../profile/PlayerSync";
import { PROFILE_PIECE_ORDER } from "../../profile/PlayerProfile";

interface CloudRow {
  bootstrapApplied: boolean;
  createdAt: string;
  displayName: string;
  publicDiscriminator: string;
  usernameOnboardingRequired: boolean;
  pieceStatistics: Record<string, { captures: number; moves: number; rolls: number }>;
  playerId: string;
  progression: Record<string, number>;
  rating: { multiplayerRating: number; ratedGames: number; rankedWins: number; rankedLosses: number;
    rankedWinRate: number; unrankedGames: number; ratingVersion: number;
    currentRankedWinStreak: number; bestRankedWinStreak: number;
    totalMultiplayerPlayTimeMs: number; multiplayerKingsCaptured: number;
    multiplayerRouletteRolls: number };
  rouletteStatistics: {
    mostRolledPiece: keyof PieceCounters | null; mostRolledPieceCount: number;
    mostPlayedPiece: keyof PieceCounters | null; mostPlayedPieceCount: number;
    threeRightsTurns: number; playerTurnsCompleted: number; threeRightsUsedRate: number;
    tripleRolls: { pieceType: keyof PieceCounters; count: number }[];
  };
}

function safeCounter(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Cloud profile contains an invalid counter.");
  }
  return value;
}

function safeRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Cloud profile contains an invalid rate.");
  }
  return value;
}

function normalizeRoulette(row: CloudRow) {
  const value = row.rouletteStatistics;
  const piece = (candidate: unknown) => candidate === null
    ? null
    : PROFILE_PIECE_ORDER.includes(candidate as keyof PieceCounters)
      ? candidate as keyof PieceCounters : (() => { throw new Error("Invalid Roulette piece."); })();
  if (!value || !Array.isArray(value.tripleRolls) || value.tripleRolls.length !== 6) {
    throw new Error("Cloud Roulette statistics are unavailable.");
  }
  const tripleRolls = value.tripleRolls.map((entry, index) => {
    const pieceType = piece(entry?.pieceType);
    if (pieceType === null || value.tripleRolls.some((other, otherIndex) =>
      otherIndex < index && other.pieceType === pieceType)) throw new Error("Invalid Triple Rolls ranking.");
    return { pieceType, count: safeCounter(entry.count) };
  });
  return {
    mostRolledPiece: piece(value.mostRolledPiece),
    mostRolledPieceCount: safeCounter(value.mostRolledPieceCount),
    mostPlayedPiece: piece(value.mostPlayedPiece),
    mostPlayedPieceCount: safeCounter(value.mostPlayedPieceCount),
    threeRightsTurns: safeCounter(value.threeRightsTurns),
    playerTurnsCompleted: safeCounter(value.playerTurnsCompleted),
    threeRightsUsedRate: safeRate(value.threeRightsUsedRate), tripleRolls,
  };
}

function pieceCounters(row: CloudRow, key: "captures" | "moves" | "rolls"): PieceCounters {
  const result = createPieceCounters();
  for (const piece of Object.keys(result) as (keyof PieceCounters)[]) {
    result[piece] = safeCounter(row.pieceStatistics[piece]?.[key] ?? 0);
  }
  return result;
}

export function normalizeCloudProfileRow(input: unknown): CloudProfileSnapshot {
  if (!input || typeof input !== "object") throw new Error("Cloud profile payload is invalid.");
  const row = input as CloudRow;
  const p = row.progression;
  const statistics: PlayerStatistics = {
    gamesPlayed: safeCounter(p.games_played), wins: safeCounter(p.wins), losses: safeCounter(p.losses),
    currentWinStreak: safeCounter(p.current_win_streak), bestWinStreak: safeCounter(p.best_win_streak),
    totalPlayTimeSeconds: safeCounter(p.total_play_time_seconds), kingsCaptured: safeCounter(p.kings_captured),
    rouletteRolls: safeCounter(p.roulette_rolls), playerTurnsCompleted: safeCounter(p.player_turns_completed),
    threeRightsTurns: safeCounter(p.three_rights_turns), triplePawnRolls: safeCounter(p.triple_pawn_rolls),
    tripleKnightRolls: safeCounter(p.triple_knight_rolls), tripleQueenRolls: safeCounter(p.triple_queen_rolls),
    tripleBishopRolls: safeCounter(p.triple_bishop_rolls), tripleRookRolls: safeCounter(p.triple_rook_rolls),
    tripleKingRolls: safeCounter(p.triple_king_rolls),
    rollsByPiece: pieceCounters(row, "rolls"), movesByPiece: pieceCounters(row, "moves"),
    capturesByPiece: pieceCounters(row, "captures"),
  };
  const profile: PlayerProfile = {
    schemaVersion: 1, playerId: row.playerId, displayName: row.displayName,
    publicDiscriminator: row.publicDiscriminator,
    usernameOnboardingRequired: row.usernameOnboardingRequired,
    createdAt: row.createdAt, totalXp: safeCounter(p.total_xp), statistics, processedMatchIds: [],
  };
  const multiplayerStatistics = {
    rating: safeCounter(row.rating.multiplayerRating), rankedGames: safeCounter(row.rating.ratedGames),
    rankedWins: safeCounter(row.rating.rankedWins), rankedLosses: safeCounter(row.rating.rankedLosses),
    rankedWinRate: safeRate(row.rating.rankedWinRate), unrankedGames: safeCounter(row.rating.unrankedGames),
    currentRankedWinStreak: safeCounter(row.rating.currentRankedWinStreak),
    bestRankedWinStreak: safeCounter(row.rating.bestRankedWinStreak),
    totalMultiplayerPlayTimeMs: safeCounter(row.rating.totalMultiplayerPlayTimeMs),
    multiplayerKingsCaptured: safeCounter(row.rating.multiplayerKingsCaptured),
    multiplayerRouletteRolls: safeCounter(row.rating.multiplayerRouletteRolls),
  };
  return { bootstrapApplied: row.bootstrapApplied, playerId: row.playerId,
    profile, multiplayerRating: multiplayerStatistics.rating, multiplayerStatistics,
    rouletteStatistics: normalizeRoulette(row) };
}

export class SupabaseCloudPlayerSync implements CloudPlayerSyncPort {
  private readonly client: SupabaseClient;

  public constructor(client: SupabaseClient) {
    this.client = client;
  }

  public async loadCurrent(): Promise<CloudProfileSnapshot> {
    const { data, error } = await this.client.rpc("get_current_player_profile");
    if (error || !data) throw new Error("Cloud profile is unavailable.");
    return normalizeCloudProfileRow(data);
  }

  public async bootstrap(profile: PlayerProfile): Promise<CloudProfileSnapshot> {
    const { error } = await this.client.rpc("bootstrap_local_profile", { source_profile: profile });
    if (error) throw new Error("Cloud profile bootstrap failed.");
    return this.loadCurrent();
  }

  public async applyOperation(operation: ProgressionOperation): Promise<CloudProfileSnapshot> {
    const { data, error } = await this.client.rpc("apply_player_progression_operation", {
      requested_operation_id: operation.operationId, operation: operation.payload,
    });
    if (error || !data) throw new Error("Progression synchronization failed.");
    return normalizeCloudProfileRow(data);
  }

  public async renameCurrentPlayer(displayName: string): Promise<CloudProfileSnapshot> {
    const { error } = await this.client.rpc("rename_current_player", {
      requested_name: displayName,
    });
    if (error) throw new Error("Username update failed.");
    return this.loadCurrent();
  }
}
