import type { CurrentPlayerRank, RankedLeaderboardEntry } from "./LeaderboardContracts";

export interface LeaderboardPort {
  fetchTop100(): Promise<readonly RankedLeaderboardEntry[]>;
  fetchCurrentPlayerRank(): Promise<CurrentPlayerRank>;
}
