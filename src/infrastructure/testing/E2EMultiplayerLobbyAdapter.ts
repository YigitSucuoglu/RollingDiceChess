import type { CreateLobbyIntent, MultiplayerLobbySnapshot } from "../../domain/multiplayer/MultiplayerContracts";
import type {
  CurrentMultiplayerContext,
  MultiplayerInvalidation,
  MultiplayerLobbyPort,
  MultiplayerStartResult,
  OpenMultiplayerLobby,
} from "../../application/multiplayer/MultiplayerLobbyPort";
import { MultiplayerLobbyError } from "../../application/multiplayer/MultiplayerLobbyPort";

const host = { displayName: "Yigit", publicDiscriminator: "19F1P", multiplayerRating: 1248 };
const opponent = { displayName: "Guest4921", publicDiscriminator: "7K2M9", multiplayerRating: 1032 };
const time = { id: "blitz-5-1", initialMs: 300_000, incrementMs: 1_000 };

function snapshot(overrides: Partial<MultiplayerLobbySnapshot> = {}): MultiplayerLobbySnapshot {
  return {
    schemaVersion: 1,
    lobbyId: "11111111-1111-4111-8111-111111111111",
    status: "waiting",
    visibility: "public",
    mode: "ranked",
    sidePreference: "random",
    timeControl: time,
    host,
    opponent: null,
    privateCode: null,
    expiresAtMs: Date.now() + 1_800_000,
    ...overrides,
  };
}

export class E2EMultiplayerLobbyAdapter implements MultiplayerLobbyPort {
  private current: CurrentMultiplayerContext | null = null;
  private readonly listeners = new Set<(event: MultiplayerInvalidation) => void>();
  public constructor() {
    try {
      const fixture = window.localStorage.getItem("roulettechess.e2e-multiplayer-fixture.v1");
      if (fixture === "ready-host") {
        this.current = { kind: "lobby", role: "host", lobby: snapshot({ status: "ready", opponent }) };
      } else if (fixture === "active") {
        this.current = { kind: "match", matchId: "33333333-3333-4333-8333-333333333333" };
      } else if (fixture === "legacy-active") {
        this.current = { kind: "legacy-match", matchId: "44444444-4444-4444-8444-444444444444" };
      }
    } catch { /* Fixture remains in its empty default state. */ }
  }
  public isAvailable(): boolean { return true; }
  public async listOpenLobbies(): Promise<readonly OpenMultiplayerLobby[]> {
    return this.current?.kind === "lobby" ? [] : [{
      lobbyId: "22222222-2222-4222-8222-222222222222",
      host,
      mode: "ranked",
      sidePreference: "random",
      timeControl: time,
    }];
  }
  public async getCurrentContext(): Promise<CurrentMultiplayerContext | null> { return this.current; }
  public async getLobby(): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    if (this.current?.kind !== "lobby") throw new MultiplayerLobbyError("lobby-unavailable");
    return this.current;
  }
  public async createLobby(intent: CreateLobbyIntent): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    this.current = { kind: "lobby", role: "host", lobby: snapshot({
      mode: intent.mode,
      visibility: intent.visibility,
      sidePreference: intent.mode === "ranked" ? "random" : intent.sidePreference,
      timeControl: intent.timeControl,
      privateCode: intent.visibility === "private" ? "004921" : null,
    }) };
    this.publish({ scope: "public-list", event: "created" });
    return this.current;
  }
  public async joinPublicLobby(lobbyId: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    this.current = { kind: "lobby", role: "opponent", lobby: snapshot({ lobbyId, status: "ready", opponent }) };
    return this.current;
  }
  public async joinPrivateLobby(code: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    if (code !== "004921") throw new MultiplayerLobbyError("lobby-unavailable");
    this.current = { kind: "lobby", role: "opponent", lobby: snapshot({
      status: "ready", visibility: "private", privateCode: code, opponent,
    }) };
    return this.current;
  }
  public async kickOpponent(): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    if (this.current?.kind !== "lobby" || this.current.role !== "host") throw new MultiplayerLobbyError("forbidden");
    this.current = { ...this.current, lobby: { ...this.current.lobby, opponent: null, status: "waiting" } };
    return this.current;
  }
  public async leaveLobby(): Promise<void> { this.current = null; }
  public async recoverLegacyMatch(matchId: string): Promise<void> {
    if (this.current?.kind !== "legacy-match" || this.current.matchId !== matchId) {
      throw new MultiplayerLobbyError("forbidden");
    }
    this.current = null;
    try { window.localStorage.removeItem("roulettechess.e2e-multiplayer-fixture.v1"); } catch { /* no-op */ }
  }
  public async startMatch(): Promise<MultiplayerStartResult> {
    const matchId = "33333333-3333-4333-8333-333333333333";
    this.current = { kind: "match", matchId };
    return { matchId, status: "active", ownSide: "white", revision: 1 };
  }
  public subscribe(listener: (event: MultiplayerInvalidation) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  public dispose(): void { this.listeners.clear(); }
  private publish(event: MultiplayerInvalidation): void { for (const listener of this.listeners) listener(event); }
}
