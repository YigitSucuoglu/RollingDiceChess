import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import {
  MULTIPLAYER_CONTRACT_VERSION,
  PRIVATE_LOBBY_CODE_PATTERN,
  type CreateLobbyIntent,
  type MultiplayerLobbySnapshot,
  type MultiplayerParticipantPublicSummary,
} from "../../domain/multiplayer/MultiplayerContracts";
import {
  MultiplayerLobbyError,
  type CurrentMultiplayerContext,
  type MultiplayerInvalidation,
  type MultiplayerLobbyPort,
  type MultiplayerLobbyRole,
  type MultiplayerStartResult,
  type OpenMultiplayerLobby,
} from "../../application/multiplayer/MultiplayerLobbyPort";
import { SupabaseMultiplayerMatchAdapter } from "./SupabaseMultiplayerMatchAdapter";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MultiplayerLobbyError("unknown");
  }
  return value as JsonObject;
}

function string(value: unknown): string {
  if (typeof value !== "string" || !value) throw new MultiplayerLobbyError("unknown");
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new MultiplayerLobbyError("unknown");
  return value;
}

function participant(value: unknown): MultiplayerParticipantPublicSummary {
  const row = object(value);
  return {
    displayName: string(row.displayName),
    publicDiscriminator: string(row.publicDiscriminator),
    multiplayerRating: number(row.multiplayerRating),
  };
}

function lobby(value: unknown): MultiplayerLobbySnapshot {
  const row = object(value);
  const time = object(row.timeControl);
  const status = string(row.status);
  const visibility = string(row.visibility);
  const mode = string(row.mode);
  const sidePreference = string(row.sidePreference);
  if (!(["waiting", "ready", "starting", "closed"] as const).includes(status as never)
      || !(["public", "private"] as const).includes(visibility as never)
      || !(["ranked", "unranked"] as const).includes(mode as never)
      || !(["white", "black", "random"] as const).includes(sidePreference as never)) {
    throw new MultiplayerLobbyError("unknown");
  }
  const expiresAt = Date.parse(string(row.expiresAt));
  if (!Number.isFinite(expiresAt)) throw new MultiplayerLobbyError("unknown");
  return {
    schemaVersion: MULTIPLAYER_CONTRACT_VERSION,
    lobbyId: string(row.lobbyId),
    status: status as MultiplayerLobbySnapshot["status"],
    visibility: visibility as MultiplayerLobbySnapshot["visibility"],
    mode: mode as MultiplayerLobbySnapshot["mode"],
    sidePreference: sidePreference as MultiplayerLobbySnapshot["sidePreference"],
    timeControl: {
      id: string(time.id),
      initialMs: number(time.initialMs),
      incrementMs: number(time.incrementMs),
    },
    host: participant(row.host),
    opponent: row.opponent === null ? null : participant(row.opponent),
    privateCode: row.privateCode === null ? null : string(row.privateCode),
    expiresAtMs: expiresAt,
  };
}

function role(value: unknown): MultiplayerLobbyRole {
  if (value !== "host" && value !== "opponent") throw new MultiplayerLobbyError("unknown");
  return value;
}

function lobbyContext(value: unknown): Extract<CurrentMultiplayerContext, { kind: "lobby" }> {
  const row = object(value);
  return { kind: "lobby", role: role(row.role), lobby: lobby(row.lobby) };
}

function mapError(error: { code?: string; message?: string } | null): MultiplayerLobbyError {
  const message = error?.message?.toLowerCase() ?? "";
  if (error?.code === "23505" || message.includes("already has an active")) return new MultiplayerLobbyError("already-active");
  if (error?.code === "42501" || message.includes("authorization")) return new MultiplayerLobbyError("forbidden");
  if (error?.code === "P0002" || message.includes("no longer available") || message.includes("not found")) return new MultiplayerLobbyError("lobby-unavailable");
  if (message.includes("full") || message.includes("not ready")) return new MultiplayerLobbyError("lobby-full");
  if (message.includes("fetch") || message.includes("network")) return new MultiplayerLobbyError("network");
  return new MultiplayerLobbyError("unknown");
}

export class SupabaseMultiplayerLobbyAdapter implements MultiplayerLobbyPort {
  private readonly client: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private readonly listeners = new Set<(event: MultiplayerInvalidation) => void>();

  public constructor(client: SupabaseClient) { this.client = client; }
  public isAvailable(): boolean { return true; }

  public async listOpenLobbies(): Promise<readonly OpenMultiplayerLobby[]> {
    const { data, error } = await this.client.rpc("list_open_multiplayer_lobbies");
    if (error) throw mapError(error);
    if (!Array.isArray(data)) throw new MultiplayerLobbyError("unknown");
    return data.map((value) => {
      const row = object(value);
      const mode = string(row.mode);
      const sidePreference = string(row.side_preference);
      if ((mode !== "ranked" && mode !== "unranked")
          || (sidePreference !== "white" && sidePreference !== "black" && sidePreference !== "random")) {
        throw new MultiplayerLobbyError("unknown");
      }
      return {
        lobbyId: string(row.lobby_id),
        host: {
          displayName: string(row.host_display_name),
          publicDiscriminator: string(row.host_public_discriminator),
          multiplayerRating: number(row.host_rating),
        },
        mode,
        sidePreference,
        timeControl: {
          id: string(row.time_control_id),
          initialMs: number(row.initial_ms),
          incrementMs: number(row.increment_ms),
        },
      };
    });
  }

  public async getCurrentContext(): Promise<CurrentMultiplayerContext | null> {
    const data = await new SupabaseMultiplayerMatchAdapter(this.client).reconcileCurrent();
    if (data === null) return null;
    const row = object(data);
    if (row.kind === "match") return { kind: "match", matchId: string(row.matchId) };
    if (row.kind === "legacy-match") return { kind: "legacy-match", matchId: string(row.matchId) };
    if (row.kind !== "lobby") throw new MultiplayerLobbyError("unknown");
    return lobbyContext(row);
  }

  public async getLobby(lobbyId: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    const { data, error } = await this.client.rpc("get_multiplayer_lobby_snapshot", { requested_lobby_id: lobbyId });
    if (error) throw mapError(error);
    return lobbyContext(data);
  }

  public async createLobby(intent: CreateLobbyIntent): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    const { data, error } = await this.client.rpc("create_multiplayer_lobby", {
      requested_visibility: intent.visibility,
      requested_mode: intent.mode,
      requested_side_preference: intent.mode === "ranked" ? "random" : intent.sidePreference,
      requested_time_control_id: intent.timeControl.id,
      requested_initial_ms: intent.timeControl.initialMs,
      requested_increment_ms: intent.timeControl.incrementMs,
    });
    if (error) throw mapError(error);
    return { kind: "lobby", role: "host", lobby: lobby(data) };
  }

  public async joinPublicLobby(lobbyId: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    return this.join({ requested_lobby_id: lobbyId, requested_private_code: undefined });
  }

  public async joinPrivateLobby(code: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    if (!PRIVATE_LOBBY_CODE_PATTERN.test(code)) throw new MultiplayerLobbyError("invalid-code");
    return this.join({ requested_lobby_id: undefined, requested_private_code: code });
  }

  public async kickOpponent(lobbyId: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>> {
    const { data, error } = await this.client.rpc("kick_multiplayer_lobby_opponent", { requested_lobby_id: lobbyId });
    if (error) throw mapError(error);
    return { kind: "lobby", role: "host", lobby: lobby(data) };
  }

  public async leaveLobby(lobbyId: string): Promise<void> {
    const { error } = await this.client.rpc("leave_multiplayer_lobby", { requested_lobby_id: lobbyId });
    if (error) throw mapError(error);
  }

  public async recoverLegacyMatch(matchId: string): Promise<void> {
    await new SupabaseMultiplayerMatchAdapter(this.client).recoverLegacy(matchId);
  }

  public async startMatch(lobbyId: string): Promise<MultiplayerStartResult> {
    const { data: matchId, error } = await this.client.rpc("request_multiplayer_match_start", { requested_lobby_id: lobbyId });
    if (error) throw mapError(error);
    const id = string(matchId);
    const snapshot = await new SupabaseMultiplayerMatchAdapter(this.client).request({ action: "start", matchId: id });
    return { matchId: id, status: snapshot.status === "active" ? "active" : "initializing", ownSide: snapshot.ownSide, revision: snapshot.revision };
  }

  public subscribe(listener: (event: MultiplayerInvalidation) => void): () => void {
    this.listeners.add(listener);
    this.ensureChannel();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.removeChannel();
    };
  }

  public dispose(): void { this.listeners.clear(); this.removeChannel(); }

  private async join(args: { requested_lobby_id?: string; requested_private_code?: string }) {
    const { data, error } = await this.client.rpc("join_multiplayer_lobby", args);
    if (error) throw mapError(error);
    return { kind: "lobby" as const, role: "opponent" as const, lobby: lobby(data) };
  }

  private ensureChannel(): void {
    if (this.channel) return;
    this.channel = this.client
      .channel("multiplayer:lobby-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "multiplayer_lobby_events" }, (payload) => {
        const row = object(payload.new);
        const scope = row.scope;
        const event = typeof row.event_kind === "string" ? row.event_kind : "changed";
        if (scope === "public-list") this.publish({ scope, event });
        if (scope === "participant" && typeof row.lobby_id === "string") {
          this.publish({ scope, event, lobbyId: row.lobby_id });
        }
      })
      .subscribe();
  }

  private removeChannel(): void {
    if (!this.channel) return;
    void this.client.removeChannel(this.channel);
    this.channel = null;
  }

  private publish(event: MultiplayerInvalidation): void {
    for (const listener of this.listeners) listener(event);
  }
}
