import { describe, expect, it, vi } from "vitest";

import { LeaderboardService } from "../../src/application/leaderboard/LeaderboardService";
import { LeaderboardReadError, type CurrentPlayerRank, type RankedLeaderboardEntry } from "../../src/application/leaderboard/LeaderboardContracts";
import type { LeaderboardPort } from "../../src/application/leaderboard/LeaderboardPort";
import { SupabaseLeaderboardAdapter, type LeaderboardRpcClient } from "../../src/infrastructure/leaderboard/SupabaseLeaderboardAdapter";

const rawEntry = (overrides: Record<string, unknown> = {}) => ({
  rank: 1,
  username: "Guest0001",
  discriminator: "ABCDE",
  rating: 1000,
  ranked_games: 1,
  ranked_wins: 0,
  ranked_losses: 1,
  ranked_win_rate: "0",
  is_current_player: false,
  ...overrides,
});

const entry = (overrides: Partial<RankedLeaderboardEntry> = {}): RankedLeaderboardEntry => ({
  rank: 1,
  username: "Guest0001",
  discriminator: "ABCDE",
  rating: 1000,
  rankedGames: 1,
  rankedWins: 0,
  rankedLosses: 1,
  rankedWinRate: 0,
  isCurrentPlayer: false,
  ...overrides,
});

const current = (overrides: Partial<CurrentPlayerRank> = {}): CurrentPlayerRank => ({
  ...entry({ isCurrentPlayer: true }),
  qualified: true,
  isCurrentPlayer: true,
  ...overrides,
});

function client(handler: (name: string) => { data: unknown; error: null | { code?: string; message?: string } }): LeaderboardRpcClient {
  return { rpc: async (name) => handler(name) };
}

function port(overrides: Partial<LeaderboardPort> = {}): LeaderboardPort {
  return {
    fetchTop100: async () => [entry()],
    fetchCurrentPlayerRank: async () => current(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("SupabaseLeaderboardAdapter", () => {
  it("normalizes Top 100 without sorting or leaking internal identity fields", async () => {
    const adapter = new SupabaseLeaderboardAdapter(client(() => ({ data: [
      rawEntry({ rank: "2", username: "Second", discriminator: "BBBBB", player_id: "private-2" }),
      rawEntry({ rank: "1", username: "First", discriminator: "AAAAA", rating: 1200, auth_user_id: "private-1" }),
    ], error: null })));

    const result = await adapter.fetchTop100();
    expect(result.map((item) => item.rank)).toEqual([2, 1]);
    expect(result[0]).toEqual(entry({ rank: 2, username: "Second", discriminator: "BBBBB" }));
    expect("playerId" in result[0] || "player_id" in result[0] || "auth_user_id" in result[0]).toBe(false);
  });

  it("uses authoritative isCurrentPlayer for a caller inside the Top 100", async () => {
    const adapter = new SupabaseLeaderboardAdapter(client(() => ({
      data: [rawEntry({ is_current_player: true })], error: null,
    })));
    expect((await adapter.fetchTop100())[0].isCurrentPlayer).toBe(true);
  });

  it("normalizes a qualified caller outside the Top 100", async () => {
    const adapter = new SupabaseLeaderboardAdapter(client(() => ({ data: [rawEntry({
      qualified: true, rank: "347", is_current_player: true,
    })], error: null })));
    expect(await adapter.fetchCurrentPlayerRank()).toMatchObject({ qualified: true, rank: 347 });
  });

  it("represents an unqualified 0-game caller explicitly", async () => {
    const adapter = new SupabaseLeaderboardAdapter(client(() => ({ data: [rawEntry({
      qualified: false, rank: null, ranked_games: 0, ranked_losses: 0,
      is_current_player: true,
    })], error: null })));
    expect(await adapter.fetchCurrentPlayerRank()).toMatchObject({ qualified: false, rank: null, rankedGames: 0 });
  });

  it("accepts the same public contract for a cloud Guest caller", async () => {
    const adapter = new SupabaseLeaderboardAdapter(client(() => ({ data: [rawEntry({
      qualified: true, username: "Guest4921", is_current_player: true,
    })], error: null })));
    expect((await adapter.fetchCurrentPlayerRank()).username).toBe("Guest4921");
  });

  it("returns an empty authoritative collection", async () => {
    const adapter = new SupabaseLeaderboardAdapter(client(() => ({ data: [], error: null })));
    await expect(adapter.fetchTop100()).resolves.toEqual([]);
  });

  it("normalizes RPC and invalid-response failures", async () => {
    const failed = new SupabaseLeaderboardAdapter(client(() => ({
      data: null, error: { message: "Failed to fetch" },
    })));
    await expect(failed.fetchTop100()).rejects.toMatchObject({ code: "network" });

    const invalid = new SupabaseLeaderboardAdapter(client(() => ({ data: [{ player_id: "secret" }], error: null })));
    await expect(invalid.fetchTop100()).rejects.toMatchObject({ code: "invalid-response" });
  });
});

describe("LeaderboardService", () => {
  it("loads Top 100 and My Rank in parallel and exposes success", async () => {
    const top = deferred<readonly RankedLeaderboardEntry[]>();
    const own = deferred<CurrentPlayerRank>();
    const service = new LeaderboardService(port({
      fetchTop100: () => top.promise,
      fetchCurrentPlayerRank: () => own.promise,
    }));
    const request = service.load();
    top.resolve([entry()]);
    await vi.waitFor(() => expect(service.getState().top.status).toBe("success"));
    expect(service.getState().currentPlayer.status).toBe("loading");
    own.resolve(current({ rank: 347 }));
    await request;
    expect(service.getState().currentPlayer).toMatchObject({ status: "qualified", player: { rank: 347 } });
  });

  it("keeps Top 100 visible when My Rank fails", async () => {
    const service = new LeaderboardService(port({
      fetchCurrentPlayerRank: async () => { throw new LeaderboardReadError("network"); },
    }));
    await service.load();
    expect(service.getState().top.status).toBe("success");
    expect(service.getState().currentPlayer).toMatchObject({ status: "error", error: { code: "network" } });
  });

  it("keeps My Rank visible when Top 100 fails", async () => {
    const service = new LeaderboardService(port({
      fetchTop100: async () => { throw new LeaderboardReadError("network"); },
    }));
    await service.load();
    expect(service.getState().top).toMatchObject({ status: "error" });
    expect(service.getState().currentPlayer.status).toBe("qualified");
  });

  it("coalesces duplicate initial loads", async () => {
    const top = deferred<readonly RankedLeaderboardEntry[]>();
    const fetchTop100 = vi.fn(() => top.promise);
    const service = new LeaderboardService(port({ fetchTop100 }));
    const first = service.load();
    const duplicate = service.load();
    expect(duplicate).toBe(first);
    expect(fetchTop100).toHaveBeenCalledTimes(1);
    top.resolve([]);
    await first;
    expect(service.getState().top.status).toBe("empty");
  });

  it("prevents an older response from overwriting explicit revalidation", async () => {
    const oldTop = deferred<readonly RankedLeaderboardEntry[]>();
    const newTop = deferred<readonly RankedLeaderboardEntry[]>();
    const fetchTop100 = vi.fn()
      .mockReturnValueOnce(oldTop.promise)
      .mockReturnValueOnce(newTop.promise);
    const service = new LeaderboardService(port({ fetchTop100 }));
    const oldRequest = service.load();
    const newRequest = service.revalidate();
    newTop.resolve([entry({ rank: 1, username: "New" })]);
    await newRequest;
    oldTop.resolve([entry({ rank: 1, username: "Old" })]);
    await oldRequest;
    expect(service.getState().top).toMatchObject({
      status: "success", entries: [{ username: "New" }],
    });
  });
});
