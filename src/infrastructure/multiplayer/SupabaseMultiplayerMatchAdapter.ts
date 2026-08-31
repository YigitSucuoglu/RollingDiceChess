import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MultiplayerMatchIntent,
  MultiplayerMatchPort,
  MultiplayerServerSnapshot,
} from "../../application/multiplayer/MultiplayerMatchPort";
import type { CurrentMultiplayerContext } from "../../application/multiplayer/MultiplayerLobbyPort";
import {
  markRealtimeObserved,
  markRequestStarted,
  markResponseReceived,
} from "./MultiplayerLatencyDiagnostics";

export class MultiplayerMatchTransportError extends Error {
  public readonly code: string;

  public constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "MultiplayerMatchTransportError";
  }
}

export class SupabaseMultiplayerMatchAdapter implements MultiplayerMatchPort {
  private readonly client: SupabaseClient;

  public constructor(client: SupabaseClient) { this.client = client; }

  public async request(intent: MultiplayerMatchIntent): Promise<MultiplayerServerSnapshot> {
    return this.send<MultiplayerServerSnapshot>(intent);
  }

  public async recoverLegacy(matchId: string): Promise<void> {
    await this.send({ action: "recover-legacy", matchId });
  }

  public async reconcileCurrent(): Promise<CurrentMultiplayerContext | null> {
    const result = await this.send<CurrentMultiplayerContext
      | { readonly kind: "none" }
      | { readonly kind: "recovered" }>({
      action: "reconcile",
    });
    return result.kind === "none" || result.kind === "recovered" ? null : result;
  }

  private async send<T>(intent: MultiplayerMatchIntent
    | { readonly action: "recover-legacy"; readonly matchId: string }
    | { readonly action: "reconcile" }): Promise<T> {
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new MultiplayerMatchTransportError("authentication-required");
    const requestStartedAt = markRequestStarted(intent.action);
    let response: Response;
    try {
      response = await fetch("/api/multiplayer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(intent),
      });
    } catch {
      throw new MultiplayerMatchTransportError("network");
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload && typeof payload === "object" && "error" in payload
        && typeof payload.error === "string" ? payload.error : "unknown";
      throw new MultiplayerMatchTransportError(code);
    }
    markResponseReceived(
      intent.action,
      requestStartedAt,
      response.headers.get("Server-Timing"),
      response.headers.get("X-RouletteChess-Request-Id"),
    );
    return payload as T;
  }

  public subscribe(matchId: string, listener: () => void): () => void {
    const channel = this.client
      .channel(`multiplayer:match:${matchId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "multiplayer_match_events",
        filter: `match_id=eq.${matchId}`,
      }, () => {
        markRealtimeObserved();
        listener();
      })
      .subscribe();
    return () => { void this.client.removeChannel(channel); };
  }
}
