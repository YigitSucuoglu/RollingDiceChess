import { LeaderboardReadError, type CurrentPlayerRank, type RankedLeaderboardEntry } from "../../application/leaderboard/LeaderboardContracts";
import type { LeaderboardPort } from "../../application/leaderboard/LeaderboardPort";

const FIXTURE_KEY = "roulettechess.e2e-leaderboard-fixture.v1";
type Fixture = "default" | "one" | "two" | "outside" | "unqualified" | "empty" | "top-error" | "rank-error" | "long";
function fixture(): Fixture {
  const value = window.localStorage.getItem(FIXTURE_KEY);
  return value === "one" || value === "two" || value === "outside" || value === "unqualified"
    || value === "empty" || value === "top-error" || value === "rank-error" || value === "long" ? value : "default";
}
function entry(rank: number, isCurrentPlayer = false): RankedLeaderboardEntry {
  return { rank, username: isCurrentPlayer ? "Yigit" : `Player${String(rank).padStart(3, "0")}`,
    discriminator: isCurrentPlayer ? "19F1P" : String(rank).padStart(5, "0"), rating: 1801 - rank,
    rankedGames: 12, rankedWins: 8, rankedLosses: 4, rankedWinRate: 8 / 12, isCurrentPlayer };
}
function entriesFor(selected: Fixture): readonly RankedLeaderboardEntry[] {
  if (selected === "empty") return [];
  const count = selected === "one" ? 1 : selected === "two" ? 2 : selected === "long" ? 4 : 100;
  const entries = Array.from({ length: count }, (_, index) => entry(index + 1,
    (selected === "default" && index === 49) || (selected === "one" && index === 0)));
  if (selected === "long") entries[3] = { ...entries[3], username: "MaximumLengthUsernameTest", discriminator: "ABCDE" };
  return entries;
}
function currentFor(selected: Fixture): CurrentPlayerRank {
  if (selected === "unqualified") return { ...entry(101, true), qualified: false, rank: null, isCurrentPlayer: true };
  if (selected === "outside") return { ...entry(347, true), qualified: true, isCurrentPlayer: true };
  const rank = selected === "default" ? 50 : 1;
  return { ...entry(rank, true), qualified: true, isCurrentPlayer: true };
}
export class E2ELeaderboardAdapter implements LeaderboardPort {
  public async fetchTop100(): Promise<readonly RankedLeaderboardEntry[]> {
    const selected = fixture();
    if (selected === "top-error") throw new LeaderboardReadError("network");
    return entriesFor(selected);
  }
  public async fetchCurrentPlayerRank(): Promise<CurrentPlayerRank> {
    const selected = fixture();
    if (selected === "rank-error") throw new LeaderboardReadError("network");
    return currentFor(selected);
  }
}
