export interface RankedLeaderboardEntry {
  readonly rank: number;
  readonly username: string;
  readonly discriminator: string;
  readonly rating: number;
  readonly rankedGames: number;
  readonly rankedWins: number;
  readonly rankedLosses: number;
  readonly rankedWinRate: number;
  readonly isCurrentPlayer: boolean;
}

export interface CurrentPlayerRank {
  readonly qualified: boolean;
  readonly rank: number | null;
  readonly username: string;
  readonly discriminator: string;
  readonly rating: number;
  readonly rankedGames: number;
  readonly rankedWins: number;
  readonly rankedLosses: number;
  readonly rankedWinRate: number;
  readonly isCurrentPlayer: true;
}

export type LeaderboardCollectionState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "empty" }
  | { readonly status: "success"; readonly entries: readonly RankedLeaderboardEntry[] }
  | { readonly status: "error"; readonly error: LeaderboardReadError };

export type CurrentPlayerRankState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "qualified"; readonly player: CurrentPlayerRank & { readonly qualified: true; readonly rank: number } }
  | { readonly status: "unqualified"; readonly player: CurrentPlayerRank & { readonly qualified: false; readonly rank: null } }
  | { readonly status: "error"; readonly error: LeaderboardReadError };

export interface LeaderboardState {
  readonly top: LeaderboardCollectionState;
  readonly currentPlayer: CurrentPlayerRankState;
}

export type LeaderboardReadErrorCode = "forbidden" | "network" | "unavailable" | "invalid-response";

export class LeaderboardReadError extends Error {
  public readonly code: LeaderboardReadErrorCode;

  public constructor(code: LeaderboardReadErrorCode) {
    super(code);
    this.name = "LeaderboardReadError";
    this.code = code;
  }
}
