import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608310001_multiplayer_01d_lobby_host_lease.sql",
  "utf8",
).toLowerCase();
const multiplayerPage = readFileSync("src/pages/MultiplayerPage.tsx", "utf8");

describe("MULTIPLAYER-01D pre-match host lease boundary", () => {
  it("uses a three-minute server lease capped by the unchanged hard TTL", () => {
    expect(migration).toContain("host_lease_expires_at timestamptz not null default (now() + interval '3 minutes')");
    expect(migration).toContain("least(expires_at, now() + interval '3 minutes')");
    expect(migration).toContain("host_lease_expires_at <= expires_at");
    expect(migration).not.toMatch(/set\s+expires_at\s*=/u);
  });

  it("excludes expired public discovery and rejects public/private joins under row lock", () => {
    expect(migration).toMatch(/list_open_multiplayer_lobbies[\s\S]+host_lease_expires_at > now\(\)/u);
    expect(migration).toMatch(/join_multiplayer_lobby[\s\S]+for update[\s\S]+host_lease_expires_at <= now\(\)/u);
    expect(migration).toContain("where visibility = 'private' and private_code = requested_private_code for update");
    expect(migration).toContain("where visibility = 'public' and lobby_id = requested_lobby_id for update");
  });

  it("closes expired consistent waiting/ready state before trusted reconcile returns it", () => {
    expect(migration).toMatch(/trusted_reconcile_multiplayer_state[\s\S]+lobby\.status in \('waiting', 'ready'\)[\s\S]+host_lease_expires_at <= now\(\)[\s\S]+set status = 'closed'/u);
    expect(migration).toMatch(/create_multiplayer_lobby[\s\S]+expire_multiplayer_lobby\(existing_lobby_id\)[\s\S]+player already has an active lobby or match/u);
  });

  it("keeps heartbeat caller-bound, server-timed and free of status/event updates", () => {
    const heartbeat = migration.slice(
      migration.indexOf("create or replace function public.heartbeat_multiplayer_lobby"),
      migration.indexOf("create or replace function public.request_multiplayer_match_start"),
    );
    expect(heartbeat).toContain("caller uuid := private.current_player_id()");
    expect(heartbeat).toContain("lobby.host_player_id is distinct from caller");
    expect(heartbeat).toContain("host_last_seen_at = now()");
    expect(heartbeat).not.toContain("set status =");
    expect(heartbeat).not.toContain("opponent_player_id =");
  });

  it("does not touch active-match reconnect, terminal, or rating authority", () => {
    expect(migration).not.toContain("white_reconnect_deadline");
    expect(migration).not.toContain("black_reconnect_deadline");
    expect(migration).not.toContain("settle_ranked_match");
    expect(migration).not.toContain("player_ratings set");
  });

  it("schedules heartbeat only for the hosted lobby at a bounded 60-second interval", () => {
    expect(multiplayerPage).toContain("const LOBBY_HEARTBEAT_INTERVAL_MS = 60_000");
    expect(multiplayerPage).toContain('context.role === "host"');
    expect(multiplayerPage).toContain("multiplayerLobby.heartbeatLobby(hostedLobbyId)");
    expect(multiplayerPage).toContain("window.clearInterval(interval)");
  });
});
