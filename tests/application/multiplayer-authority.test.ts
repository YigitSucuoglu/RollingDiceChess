import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MultiplayerAuthorityPrototype } from "../../src/application/multiplayer/MultiplayerAuthorityPrototype";
import { toPlayerId } from "../../src/application/players/PlayerContracts";
import { RECONNECT_GRACE_MS, type CreateLobbyIntent, type TrustedMultiplayerParticipant } from "../../src/domain/multiplayer/MultiplayerContracts";

function participant(index: number): TrustedMultiplayerParticipant {
  return {
    playerId: toPlayerId(`00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`),
    publicSummary: {
      displayName: index === 1 ? "Host" : `Guest${index.toString().padStart(4, "0")}`,
      publicDiscriminator: `P${index.toString().padStart(4, "0")}`,
      multiplayerRating: 900 + index * 100,
    },
  };
}

const PUBLIC_RANKED: CreateLobbyIntent = {
  visibility: "public",
  mode: "ranked",
  sidePreference: "random",
  timeControl: { id: "blitz-5-1", initialMs: 300_000, incrementMs: 1_000 },
};

function fixture(randomValues: number[] = [0.1, 0.2, 0.3, 0.4]) {
  let now = 1_000;
  let id = 0;
  let randomIndex = 0;
  const authority = new MultiplayerAuthorityPrototype(
    () => randomValues[randomIndex++ % randomValues.length],
    { now: () => now },
    { nextId: () => `authority-${++id}` },
  );
  return { authority, advance: (milliseconds: number) => { now += milliseconds; } };
}

describe("authoritative multiplayer lobby foundation", () => {
  it("moves waiting -> ready and hides a filled public lobby", () => {
    const { authority } = fixture();
    const lobby = authority.createLobby(participant(1), PUBLIC_RANKED);
    expect(authority.listPublicLobbies()).toHaveLength(1);
    const ready = authority.joinPublicLobby(participant(2), lobby.lobbyId);
    expect(ready.status).toBe("ready");
    expect(authority.listPublicLobbies()).toHaveLength(0);
  });

  it("uses atomic first-write-wins semantics for the opponent slot", () => {
    const { authority } = fixture();
    const lobby = authority.createLobby(participant(1), PUBLIC_RANKED);
    authority.joinPublicLobby(participant(2), lobby.lobbyId);
    expect(() => authority.joinPublicLobby(participant(3), lobby.lobbyId)).toThrow(/no longer available/);
  });

  it("lets only the host kick before start and makes a public lobby visible again", () => {
    const { authority } = fixture();
    const lobby = authority.createLobby(participant(1), PUBLIC_RANKED);
    authority.joinPublicLobby(participant(2), lobby.lobbyId);
    expect(() => authority.kickOpponent(participant(2).playerId, lobby.lobbyId)).toThrow(/Only the host/);
    expect(authority.kickOpponent(participant(1).playerId, lobby.lobbyId).status).toBe("waiting");
    expect(authority.listPublicLobbies()).toHaveLength(1);
  });

  it("applies penalty-free pre-start leave transitions", () => {
    const { authority } = fixture();
    const readyLobby = authority.createLobby(participant(1), PUBLIC_RANKED);
    authority.joinPublicLobby(participant(2), readyLobby.lobbyId);
    expect(authority.leaveLobby(participant(2).playerId, readyLobby.lobbyId)).toMatchObject({ status: "waiting", opponent: null });
    authority.joinPublicLobby(participant(2), readyLobby.lobbyId);
    expect(authority.leaveLobby(participant(1).playerId, readyLobby.lobbyId).status).toBe("closed");
    expect(authority.listPublicLobbies()).toHaveLength(0);
  });

  it("enforces one active lobby or match membership per PlayerId", () => {
    const { authority } = fixture();
    const host = participant(1);
    const lobby = authority.createLobby(host, PUBLIC_RANKED);
    expect(() => authority.createLobby(host, PUBLIC_RANKED)).toThrow(/already has/);
    authority.joinPublicLobby(participant(2), lobby.lobbyId);
    expect(() => authority.createLobby(participant(2), PUBLIC_RANKED)).toThrow(/already has/);
  });

  it("preserves six-digit leading-zero private codes and retries collisions", () => {
    const { authority } = fixture([0.004921, 0.004921, 0.381742]);
    const privateIntent = { ...PUBLIC_RANKED, visibility: "private" as const };
    const first = authority.createLobby(participant(1), privateIntent);
    const second = authority.createLobby(participant(2), privateIntent);
    expect(first.privateCode).toBe("004921");
    expect(second.privateCode).toBe("381742");
    expect(authority.listPublicLobbies()).toHaveLength(0);
    expect(authority.joinPrivateLobby(participant(3), "004921").status).toBe("ready");
    expect(() => authority.joinPrivateLobby(participant(4), "4921")).toThrow(/available/i);
  });

  it("invalidates a closed private code", () => {
    const { authority } = fixture([0.004921]);
    const lobby = authority.createLobby(participant(1), { ...PUBLIC_RANKED, visibility: "private" });
    authority.leaveLobby(participant(1).playerId, lobby.lobbyId);
    expect(() => authority.joinPrivateLobby(participant(2), "004921")).toThrow(/available/i);
  });

  it("expires abandoned waiting lobbies", () => {
    const { authority, advance } = fixture();
    authority.createLobby(participant(1), PUBLIC_RANKED);
    advance(30 * 60_000);
    expect(authority.listPublicLobbies()).toHaveLength(0);
    expect(() => authority.createLobby(participant(1), PUBLIC_RANKED)).not.toThrow();
  });
});

describe("authoritative multiplayer match foundation", () => {
  it("allows only the host to activate exactly one match after review", () => {
    const { authority } = fixture([0.2, 0, 0.2, 0.4]);
    const lobby = authority.createLobby(participant(1), PUBLIC_RANKED);
    expect(() => authority.startMatch(participant(1).playerId, lobby.lobbyId)).toThrow(/not ready/);
    authority.joinPublicLobby(participant(2), lobby.lobbyId);
    expect(() => authority.startMatch(participant(2).playerId, lobby.lobbyId)).toThrow(/Only the host/);
    const first = authority.startMatch(participant(1).playerId, lobby.lobbyId);
    const replay = authority.startMatch(participant(1).playerId, lobby.lobbyId);
    expect(replay.matchId).toBe(first.matchId);
    expect(first).toMatchObject({ status: "active", revision: 1, game: { currentTurn: "white" } });
    expect(first.game.currentRoll).toEqual(["pawn", "knight", "bishop"]);
    expect(first.clock.activeColor).toBe("white");
  });

  it("locks ranked sides to authority randomness and honors unranked preferences", () => {
    const ranked = fixture([0.9, 0, 0, 0]);
    const rankedLobby = ranked.authority.createLobby(participant(1), PUBLIC_RANKED);
    ranked.authority.joinPublicLobby(participant(2), rankedLobby.lobbyId);
    expect(ranked.authority.startMatch(participant(1).playerId, rankedLobby.lobbyId).black.displayName).toBe("Host");

    const unranked = fixture();
    const lobby = unranked.authority.createLobby(participant(3), {
      ...PUBLIC_RANKED, mode: "unranked", sidePreference: "white",
    });
    unranked.authority.joinPublicLobby(participant(4), lobby.lobbyId);
    expect(unranked.authority.startMatch(participant(3).playerId, lobby.lobbyId).white.displayName).toBe("Guest0003");
  });

  it("rejects ranked host-selected sides", () => {
    const { authority } = fixture();
    expect(() => authority.createLobby(participant(1), { ...PUBLIC_RANKED, sidePreference: "white" })).toThrow(/random only/);
  });

  it("authorizes only minimal current-player intents at the current revision", () => {
    const { authority } = fixture([0.1, 0, 0, 0]);
    const lobby = authority.createLobby(participant(1), PUBLIC_RANKED);
    authority.joinPublicLobby(participant(2), lobby.lobbyId);
    const match = authority.startMatch(participant(1).playerId, lobby.lobbyId);
    const intent = { matchId: match.matchId, expectedRevision: 1, from: { row: 6, col: 0 }, to: { row: 5, col: 0 } };
    expect(authority.authorizeMove(participant(1).playerId, intent)).toMatchObject({ callerSide: "white", revision: 1 });
    expect(() => authority.authorizeMove(participant(2).playerId, intent)).toThrow(/not the caller's turn/);
    expect(() => authority.authorizeMove(participant(3).playerId, intent)).toThrow(/not a match participant/);
    expect(() => authority.authorizeMove(participant(1).playerId, { ...intent, expectedRevision: 0 })).toThrow(/revision/);
  });

  it("restores canonical snapshots within the 30-second reconnect grace without pausing clock", () => {
    const { authority, advance } = fixture([0.1, 0, 0, 0]);
    const lobby = authority.createLobby(participant(1), PUBLIC_RANKED);
    authority.joinPublicLobby(participant(2), lobby.lobbyId);
    const active = authority.startMatch(participant(1).playerId, lobby.lobbyId);
    const disconnected = authority.disconnect(participant(1).playerId, active.matchId);
    expect(disconnected.connections.white).toEqual({ state: "disconnected", reconnectDeadlineMs: 31_000 });
    expect(disconnected.clock.activeColor).toBe("white");
    expect(disconnected.clock.turnStartedAtMs).toBe(1_000);
    advance(RECONNECT_GRACE_MS - 1);
    const restored = authority.reconnect(participant(1).playerId, active.matchId);
    expect(restored.connections.white.state).toBe("connected");
    expect(restored.game.board).toEqual(active.game.board);
  });

  it("marks one expired disconnect as forfeit and both as technical abort", () => {
    const one = fixture([0.1, 0, 0, 0]);
    const lobby = one.authority.createLobby(participant(1), PUBLIC_RANKED);
    one.authority.joinPublicLobby(participant(2), lobby.lobbyId);
    const match = one.authority.startMatch(participant(1).playerId, lobby.lobbyId);
    one.authority.disconnect(participant(1).playerId, match.matchId);
    one.advance(RECONNECT_GRACE_MS);
    expect(one.authority.adjudicateReconnectDeadlines(match.matchId)).toMatchObject({ status: "terminal", winner: "black", terminationReason: "forfeit" });
    expect(one.authority.createFutureRatingSettlement(match.matchId)).toMatchObject({ terminationReason: "forfeit" });

    const both = fixture([0.1, 0, 0, 0]);
    const bothLobby = both.authority.createLobby(participant(3), PUBLIC_RANKED);
    both.authority.joinPublicLobby(participant(4), bothLobby.lobbyId);
    const bothMatch = both.authority.startMatch(participant(3).playerId, bothLobby.lobbyId);
    both.authority.disconnect(participant(3).playerId, bothMatch.matchId);
    both.authority.disconnect(participant(4).playerId, bothMatch.matchId);
    both.advance(RECONNECT_GRACE_MS);
    expect(both.authority.adjudicateReconnectDeadlines(bothMatch.matchId)).toMatchObject({ status: "technical-abort", terminationReason: "technical-abort" });
    expect(both.authority.createFutureRatingSettlement(bothMatch.matchId)).toBeNull();
  });

  it("treats active explicit leave as authoritative forfeit and unranked as rating-free", () => {
    const ranked = fixture([0.1, 0, 0, 0]);
    const lobby = ranked.authority.createLobby(participant(1), PUBLIC_RANKED);
    ranked.authority.joinPublicLobby(participant(2), lobby.lobbyId);
    const match = ranked.authority.startMatch(participant(1).playerId, lobby.lobbyId);
    expect(ranked.authority.leaveActiveMatch(participant(1).playerId, match.matchId)).toMatchObject({ winner: "black", terminationReason: "forfeit" });
    expect(ranked.authority.createFutureRatingSettlement(match.matchId)).not.toBeNull();

    const unranked = fixture([0.1, 0, 0, 0]);
    const unrankedLobby = unranked.authority.createLobby(participant(3), { ...PUBLIC_RANKED, mode: "unranked", sidePreference: "random" });
    unranked.authority.joinPublicLobby(participant(4), unrankedLobby.lobbyId);
    const unrankedMatch = unranked.authority.startMatch(participant(3).playerId, unrankedLobby.lobbyId);
    unranked.authority.leaveActiveMatch(participant(3).playerId, unrankedMatch.matchId);
    expect(unranked.authority.createFutureRatingSettlement(unrankedMatch.matchId)).toBeNull();
  });
});

describe("Supabase multiplayer authority boundary", () => {
  const migration = readFileSync(
    "supabase/migrations/202608190002_multiplayer_01a_foundation.sql",
    "utf8",
  );

  it("keeps canonical tables private and browser mutation-free", () => {
    expect(migration).toContain("create table private.multiplayer_lobbies");
    expect(migration).toContain("create table private.multiplayer_matches");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on all tables in schema private from public, anon, authenticated");
    expect(migration).not.toMatch(/grant (?:insert|update|delete)[\s\S]+to (?:anon|authenticated)/i);
  });

  it("restricts ACTIVE transition to service-only trusted execution", () => {
    expect(migration).toContain("create or replace function private.activate_multiplayer_match");
    expect(migration).toContain("grant execute on function private.activate_multiplayer_match(uuid,jsonb) to service_role");
    expect(migration).toMatch(/revoke all on function private\.activate_multiplayer_match[\s\S]+from public, anon, authenticated/i);
    expect(migration).toContain("current_roll = roll_result");
    expect(migration).toContain("status = 'active', revision = 1");
  });

  it("locks join/start rows and exposes only narrow authenticated intents", () => {
    expect(migration).toMatch(/join_multiplayer_lobby[\s\S]+for update/i);
    expect(migration).toMatch(/request_multiplayer_match_start[\s\S]+for update/i);
    expect(migration).toContain("multiplayer_private_join_attempts");
    expect(migration).toContain("if attempts > 10");
    expect(migration).toContain("to authenticated");
  });
});
