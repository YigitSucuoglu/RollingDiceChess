import type { SupabaseClient } from "@supabase/supabase-js";

import type { PieceCounters, PlayerProfile, PlayerStatistics } from "../../profile/PlayerProfile";
import { createPieceCounters } from "../../profile/PlayerProfile";
import type { CloudPlayerSyncPort, CloudProfileSnapshot, ProgressionOperation } from "../../profile/PlayerSync";

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
    rankedWinRate: number; unrankedGames: number; ratingVersion: number };
}

function pieceCounters(row: CloudRow, key: "captures" | "moves" | "rolls"): PieceCounters {
  const result = createPieceCounters();
  for (const piece of Object.keys(result) as (keyof PieceCounters)[]) result[piece] = row.pieceStatistics[piece]?.[key] ?? 0;
  return result;
}

function normalize(row: CloudRow): CloudProfileSnapshot {
  const p = row.progression;
  const statistics: PlayerStatistics = {
    gamesPlayed: p.games_played, wins: p.wins, losses: p.losses,
    currentWinStreak: p.current_win_streak, bestWinStreak: p.best_win_streak,
    totalPlayTimeSeconds: p.total_play_time_seconds, kingsCaptured: p.kings_captured,
    rouletteRolls: p.roulette_rolls, playerTurnsCompleted: p.player_turns_completed,
    threeRightsTurns: p.three_rights_turns, triplePawnRolls: p.triple_pawn_rolls,
    tripleKnightRolls: p.triple_knight_rolls, tripleQueenRolls: p.triple_queen_rolls,
    rollsByPiece: pieceCounters(row, "rolls"), movesByPiece: pieceCounters(row, "moves"),
    capturesByPiece: pieceCounters(row, "captures"),
  };
  const profile: PlayerProfile = {
    schemaVersion: 1, playerId: row.playerId, displayName: row.displayName,
    publicDiscriminator: row.publicDiscriminator,
    usernameOnboardingRequired: row.usernameOnboardingRequired,
    createdAt: row.createdAt, totalXp: p.total_xp, statistics, processedMatchIds: [],
  };
  const multiplayerStatistics = {
    rating: row.rating.multiplayerRating, rankedGames: row.rating.ratedGames,
    rankedWins: row.rating.rankedWins, rankedLosses: row.rating.rankedLosses,
    rankedWinRate: row.rating.rankedWinRate, unrankedGames: row.rating.unrankedGames,
  };
  return { bootstrapApplied: row.bootstrapApplied, playerId: row.playerId,
    profile, multiplayerRating: multiplayerStatistics.rating, multiplayerStatistics };
}

export class SupabaseCloudPlayerSync implements CloudPlayerSyncPort {
  private readonly client: SupabaseClient;

  public constructor(client: SupabaseClient) {
    this.client = client;
  }

  public async loadCurrent(): Promise<CloudProfileSnapshot> {
    const { data, error } = await this.client.rpc("get_current_player_profile");
    if (error || !data) throw new Error("Cloud profile is unavailable.");
    return normalize(data as unknown as CloudRow);
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
    return normalize(data as unknown as CloudRow);
  }

  public async renameCurrentPlayer(displayName: string): Promise<CloudProfileSnapshot> {
    const { error } = await this.client.rpc("rename_current_player", {
      requested_name: displayName,
    });
    if (error) throw new Error("Username update failed.");
    return this.loadCurrent();
  }
}
