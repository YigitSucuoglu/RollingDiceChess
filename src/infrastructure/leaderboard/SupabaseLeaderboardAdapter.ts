import {
  LeaderboardReadError,
  type CurrentPlayerRank,
  type RankedLeaderboardEntry,
} from "../../application/leaderboard/LeaderboardContracts";
import type { LeaderboardPort } from "../../application/leaderboard/LeaderboardPort";

type RpcError = { readonly code?: string; readonly message?: string } | null;
type RpcResult = PromiseLike<{ readonly data: unknown; readonly error: RpcError }>;

export interface LeaderboardRpcClient {
  rpc(name: string): RpcResult;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LeaderboardReadError("invalid-response");
  }
  return value as JsonObject;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new LeaderboardReadError("invalid-response");
  }
  return value;
}

function integer(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null;
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new LeaderboardReadError("invalid-response");
  }
  return parsed;
}

function rate(value: unknown): number {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new LeaderboardReadError("invalid-response");
  }
  return parsed;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new LeaderboardReadError("invalid-response");
  return value;
}

function common(row: JsonObject) {
  const rankedGames = integer(row.ranked_games) as number;
  const rankedWins = integer(row.ranked_wins) as number;
  const rankedLosses = integer(row.ranked_losses) as number;
  if (rankedGames !== rankedWins + rankedLosses) {
    throw new LeaderboardReadError("invalid-response");
  }
  return {
    username: string(row.username),
    discriminator: string(row.discriminator),
    rating: integer(row.rating) as number,
    rankedGames,
    rankedWins,
    rankedLosses,
    rankedWinRate: rate(row.ranked_win_rate),
  };
}

function entry(value: unknown): RankedLeaderboardEntry {
  const row = object(value);
  return {
    rank: integer(row.rank) as number,
    ...common(row),
    isCurrentPlayer: boolean(row.is_current_player),
  };
}

function currentPlayer(value: unknown): CurrentPlayerRank {
  const row = object(value);
  const qualified = boolean(row.qualified);
  const rank = integer(row.rank, true);
  if ((qualified && rank === null) || (!qualified && rank !== null)
      || boolean(row.is_current_player) !== true) {
    throw new LeaderboardReadError("invalid-response");
  }
  return { qualified, rank, ...common(row), isCurrentPlayer: true };
}

function mappedError(error: RpcError): LeaderboardReadError {
  const message = error?.message?.toLowerCase() ?? "";
  if (error?.code === "42501" || message.includes("canonical player")) {
    return new LeaderboardReadError("forbidden");
  }
  if (message.includes("fetch") || message.includes("network")) {
    return new LeaderboardReadError("network");
  }
  return new LeaderboardReadError("unavailable");
}

export class SupabaseLeaderboardAdapter implements LeaderboardPort {
  private readonly client: LeaderboardRpcClient;

  public constructor(client: LeaderboardRpcClient) { this.client = client; }

  public async fetchTop100(): Promise<readonly RankedLeaderboardEntry[]> {
    const { data, error } = await this.client.rpc("get_ranked_leaderboard_top_100");
    if (error) throw mappedError(error);
    if (!Array.isArray(data)) throw new LeaderboardReadError("invalid-response");
    return data.map(entry);
  }

  public async fetchCurrentPlayerRank(): Promise<CurrentPlayerRank> {
    const { data, error } = await this.client.rpc("get_current_player_ranked_rank");
    if (error) throw mappedError(error);
    if (!Array.isArray(data) || data.length !== 1) {
      throw new LeaderboardReadError("invalid-response");
    }
    return currentPlayer(data[0]);
  }
}
