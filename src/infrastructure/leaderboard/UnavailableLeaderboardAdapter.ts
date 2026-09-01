import { LeaderboardReadError, type CurrentPlayerRank, type RankedLeaderboardEntry } from "../../application/leaderboard/LeaderboardContracts";
import type { LeaderboardPort } from "../../application/leaderboard/LeaderboardPort";

export class UnavailableLeaderboardAdapter implements LeaderboardPort {
  public async fetchTop100(): Promise<readonly RankedLeaderboardEntry[]> {
    throw new LeaderboardReadError("unavailable");
  }

  public async fetchCurrentPlayerRank(): Promise<CurrentPlayerRank> {
    throw new LeaderboardReadError("unavailable");
  }
}
