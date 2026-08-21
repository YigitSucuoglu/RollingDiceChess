import { createHash, randomInt, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  advanceAuthoritativeUnplayableTurn,
  applyAuthoritativeMove,
  createAuthoritativeInitialState,
  type AuthoritativeStoredState,
} from "../src/application/multiplayer/AuthoritativeMatchEngine.js";
import type { Position } from "../src/types/Chess.js";

type JsonObject = Record<string, unknown>;

interface NodeRequest {
  readonly method?: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body?: unknown;
}

interface NodeResponse {
  status(code: number): NodeResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

interface TrustedMatchRow extends JsonObject {
  matchId: string;
  revision: number;
  status: string;
  playerAId: string;
  playerBId: string;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  canonicalState: AuthoritativeStoredState | null;
  currentRoll: readonly string[] | null;
  currentTurn: string | null;
}

class RequestFailure extends Error {
  public constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestFailure(400, "invalid-request");
  return value as JsonObject;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) throw new RequestFailure(400, "invalid-request");
  return value;
}

function position(value: unknown): Position {
  const row = object(value);
  if (!Number.isInteger(row.row) || !Number.isInteger(row.col)
      || (row.row as number) < 0 || (row.row as number) > 7
      || (row.col as number) < 0 || (row.col as number) > 7) {
    throw new RequestFailure(400, "invalid-request");
  }
  return { row: row.row as number, col: row.col as number };
}

function randomSource(): number {
  return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
}

function serverClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) throw new RequestFailure(503, "multiplayer-unavailable");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function bearer(request: NodeRequest): string {
  const raw = request.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.startsWith("Bearer ") || value.length <= 7) throw new RequestFailure(401, "authentication-required");
  return value.slice(7);
}

function reconcileLog(correlationId: string, stage: string, metadata: JsonObject = {}): void {
  console.info(JSON.stringify({ event: "multiplayer-reconcile-diagnostic", correlationId, stage, ...metadata }));
}

function callerFingerprint(playerId: string): string {
  return createHash("sha256").update(playerId).digest("hex").slice(0, 10);
}

function databaseFailureReason(error: { code?: string; message?: string }): string {
  if (error.code === "42703" || error.message?.includes("created_at")) return "undefined-column";
  if (error.code === "42883") return "undefined-function";
  if (error.code === "42501") return "permission-denied";
  if (error.code === "23514") return "check-constraint";
  if (error.code === "23503") return "foreign-key-constraint";
  return `database-error-${error.code ?? "unknown"}`;
}

async function resolveCallerPlayerId(
  client: SupabaseClient,
  accessToken: string,
  diagnostic?: (stage: string, metadata?: JsonObject) => void,
): Promise<string> {
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user?.id) throw new RequestFailure(401, "authentication-required");
  diagnostic?.("auth-verified");
  const { data: owner, error: ownerError } = await client
    .from("player_auth_owners")
    .select("player_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (ownerError || !owner || typeof owner.player_id !== "string") throw new RequestFailure(403, "player-profile-required");
  diagnostic?.("canonical-player-resolved", { callerFingerprint: callerFingerprint(owner.player_id) });
  return owner.player_id;
}

async function rpcObject(
  client: SupabaseClient,
  name: string,
  args: JsonObject,
  onError?: (reason: string) => void,
): Promise<JsonObject> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    onError?.(databaseFailureReason(error));
    if (error.code === "40001") throw new RequestFailure(409, "stale-revision");
    if (error.code === "42501") throw new RequestFailure(403, "not-authorized");
    if (error.code === "P0002") throw new RequestFailure(404, "match-unavailable");
    throw new RequestFailure(409, "match-transition-rejected");
  }
  return object(data);
}

async function rpcRow(client: SupabaseClient, name: string, args: JsonObject): Promise<TrustedMatchRow> {
  return rpcObject(client, name, args) as Promise<TrustedMatchRow>;
}

function publicSnapshot(row: TrustedMatchRow, callerPlayerId: string): JsonObject {
  const ownSide = callerPlayerId === row.whitePlayerId ? "white"
    : callerPlayerId === row.blackPlayerId ? "black" : null;
  if (!ownSide && row.status !== "initializing") throw new RequestFailure(403, "not-authorized");
  const state = row.canonicalState;
  return {
    schemaVersion: 1,
    matchId: row.matchId,
    revision: row.revision,
    status: row.status,
    mode: row.mode,
    ownSide,
    white: row.white,
    black: row.black,
    timeControl: row.timeControl,
    game: state,
    clock: {
      whiteRemainingMs: row.whiteRemainingMs,
      blackRemainingMs: row.blackRemainingMs,
      activeTurnStartedAt: row.activeTurnStartedAt,
      serverNow: row.serverNow,
    },
    connections: {
      whiteReconnectDeadline: row.whiteReconnectDeadline,
      blackReconnectDeadline: row.blackReconnectDeadline,
    },
    winner: row.winnerPlayerId === row.whitePlayerId ? "white"
      : row.winnerPlayerId === row.blackPlayerId ? "black" : null,
    terminationReason: row.terminationReason,
  };
}

async function readMatch(client: SupabaseClient, matchId: string, caller: string, refresh = true): Promise<TrustedMatchRow> {
  return rpcRow(client, "trusted_get_multiplayer_match", {
    requested_match_id: matchId,
    requested_caller_player_id: caller,
    refresh_presence: refresh,
  });
}

async function performAction(
  client: SupabaseClient,
  caller: string,
  body: JsonObject,
  correlationId: string,
): Promise<JsonObject> {
  if (Object.hasOwn(body, "playerId") || Object.hasOwn(body, "player_id")) {
    throw new RequestFailure(400, "player-id-not-accepted");
  }
  const action = requiredString(body.action);
  if (action === "reconcile") {
    const diagnostic = await rpcObject(client, "trusted_diagnose_multiplayer_reconciliation", {
      requested_caller_player_id: caller,
    }, (reason) => reconcileLog(correlationId, "diagnostic-rpc-failed", { reason }));
    reconcileLog(correlationId, "state-classified", diagnostic);
    reconcileLog(correlationId, "recovery-rpc-invoked", {
      expectedRecovery: diagnostic.classification === "stale-starting"
        || diagnostic.classification === "terminal"
        || diagnostic.classification === "orphaned"
        || diagnostic.classification === "inconsistent",
    });
    const result = await rpcObject(client, "trusted_reconcile_multiplayer_state", {
      requested_caller_player_id: caller,
    }, (reason) => reconcileLog(correlationId, "recovery-rpc-failed", {
      reason,
      cleanupCommitted: false,
    }));
    reconcileLog(correlationId, "recovery-rpc-returned", {
      normalizedKind: result.kind,
      cleanupCommitted: result.kind === "recovered" || result.kind === "none",
      finalCanonicalState: result.kind,
    });
    if (result.kind === "starting" && result.role === "host") {
      const matchId = requiredString(result.matchId);
      const state = createAuthoritativeInitialState(randomSource);
      await rpcRow(client, "trusted_activate_multiplayer_match", {
        requested_match_id: matchId,
        requested_caller_player_id: caller,
        requested_host_is_white: randomSource() < 0.5,
        trusted_initial_state: state,
        trusted_initial_roll: state.currentRoll,
      });
      return { kind: "match", matchId };
    }
    if (result.kind === "starting") return { kind: "match", matchId: result.matchId };
    return result;
  }
  const matchId = requiredString(body.matchId);
  if (action === "start") {
    const state = createAuthoritativeInitialState(randomSource);
    const row = await rpcRow(client, "trusted_activate_multiplayer_match", {
      requested_match_id: matchId,
      requested_caller_player_id: caller,
      requested_host_is_white: randomSource() < 0.5,
      trusted_initial_state: state,
      trusted_initial_roll: state.currentRoll,
    });
    return publicSnapshot(row, caller);
  }
  if (action === "snapshot" || action === "heartbeat") {
    return publicSnapshot(await readMatch(client, matchId, caller), caller);
  }
  if (action === "forfeit") {
    return publicSnapshot(await rpcRow(client, "trusted_forfeit_multiplayer_match", {
      requested_match_id: matchId,
      requested_caller_player_id: caller,
    }), caller);
  }
  if (action === "recover-legacy") {
    const row = await rpcRow(client, "trusted_recover_legacy_multiplayer_match", {
      requested_match_id: matchId,
      requested_caller_player_id: caller,
    });
    return { recovered: row.status === "technical-abort" };
  }
  if (action !== "move" && action !== "advance-unplayable") throw new RequestFailure(400, "invalid-request");
  const expectedRevision = body.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 1) throw new RequestFailure(400, "invalid-request");
  const current = await readMatch(client, matchId, caller, false);
  if (current.status !== "active" || current.revision !== expectedRevision || !current.canonicalState) {
    throw new RequestFailure(409, "stale-revision");
  }
  const callerSide = caller === current.whitePlayerId ? "white" : caller === current.blackPlayerId ? "black" : null;
  if (callerSide !== current.canonicalState.currentTurn) throw new RequestFailure(403, "not-active-player");
  const transition = action === "move"
    ? applyAuthoritativeMove(current.canonicalState, position(body.from), position(body.to), randomSource)
    : { state: advanceAuthoritativeUnplayableTurn(current.canonicalState, randomSource), turnCompleted: true, terminal: false };
  const row = await rpcRow(client, "trusted_commit_multiplayer_move", {
    requested_match_id: matchId,
    requested_caller_player_id: caller,
    expected_revision: expectedRevision,
    trusted_state: transition.state,
    trusted_roll: transition.state.currentRoll,
    trusted_turn: transition.state.currentTurn,
    turn_completed: transition.turnCompleted,
    trusted_winner: transition.state.winner,
  });
  return publicSnapshot(row, caller);
}

export default async function handler(request: NodeRequest, response: NodeResponse): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "method-not-allowed" });
    return;
  }
  const correlationId = randomUUID().replaceAll("-", "").slice(0, 12);
  let action = "unknown";
  try {
    const body = object(request.body);
    action = typeof body.action === "string" ? body.action : "unknown";
    if (action === "reconcile") reconcileLog(correlationId, "endpoint-received");
    const client = serverClient();
    const caller = await resolveCallerPlayerId(client, bearer(request), action === "reconcile"
      ? (stage, metadata) => reconcileLog(correlationId, stage, metadata)
      : undefined);
    response.status(200).json(await performAction(client, caller, body, correlationId));
  } catch (error) {
    const failure = error instanceof RequestFailure ? error : new RequestFailure(500, "multiplayer-server-error");
    if (action === "reconcile") reconcileLog(correlationId, "request-failed", { failureCode: failure.code });
    response.status(failure.status).json({ error: failure.code });
  }
}
