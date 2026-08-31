import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT_URL = "https://kbtnnknsgobfvyydxbex.supabase.co";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function guest(instance, label) {
  const auth = await instance.auth.signInAnonymously();
  if (auth.error || !auth.data.user) throw new Error(`${label} sign-in failed: ${auth.error?.message}`);
  const owner = await instance.from("player_auth_owners").select("player_id").single();
  if (owner.error) throw new Error(`${label} ownership failed: ${owner.error.message}`);
  return { authUserId: auth.data.user.id, playerId: owner.data.player_id };
}

async function rpc(instance, name, parameters, label) {
  const result = await instance.rpc(name, parameters);
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

const lobbyInput = {
  requested_visibility: "public",
  requested_mode: "ranked",
  requested_side_preference: "random",
  requested_time_control_id: "blitz-5-1",
  requested_initial_ms: 300000,
  requested_increment_ms: 1000,
};

async function run() {
  if ((!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) && existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing Supabase publishable configuration.");
  if (url !== EXPECTED_PROJECT_URL) throw new Error(`Refusing unexpected project: ${url}`);

  const hostClient = client(url, key);
  const opponentClient = client(url, key);
  const thirdClient = client(url, key);
  let host;
  let opponent;
  let third;
  try {
    host = await guest(hostClient, "host");
    opponent = await guest(opponentClient, "opponent");
    third = await guest(thirdClient, "third");

    const privateLobby = await rpc(hostClient, "create_multiplayer_lobby", {
      ...lobbyInput, requested_visibility: "private", requested_mode: "unranked",
      requested_side_preference: "white",
    }, "private lobby create");
    assert(/^\d{6}$/u.test(privateLobby.privateCode), "private code is not exactly six digits");
    const restoredHostLobby = await rpc(hostClient, "get_current_multiplayer_context", {}, "host lobby restore");
    assert(restoredHostLobby.kind === "lobby" && restoredHostLobby.role === "host"
      && restoredHostLobby.lobby.lobbyId === privateLobby.lobbyId, "host canonical lobby was not restored");
    let listing = await rpc(thirdClient, "list_open_multiplayer_lobbies", {}, "listing with private lobby");
    assert(!listing.some((entry) => entry.lobby_id === privateLobby.lobbyId), "private lobby leaked into public listing");
    await rpc(opponentClient, "join_multiplayer_lobby", { requested_private_code: privateLobby.privateCode }, "private code join");
    const restoredOpponentLobby = await rpc(opponentClient, "get_current_multiplayer_context", {}, "opponent lobby restore");
    assert(restoredOpponentLobby.kind === "lobby" && restoredOpponentLobby.role === "opponent", "opponent canonical lobby was not restored");
    const hostEvents = await hostClient.from("multiplayer_lobby_events").select("scope,lobby_id,event_kind").eq("lobby_id", privateLobby.lobbyId);
    const foreignPrivateEvents = await thirdClient.from("multiplayer_lobby_events").select("scope,lobby_id,event_kind").eq("lobby_id", privateLobby.lobbyId);
    assert(!hostEvents.error && hostEvents.data.some((event) => event.event_kind === "joined"),
      `participant realtime invalidation is missing: ${hostEvents.error?.message ?? JSON.stringify(hostEvents.data)}`);
    assert(!foreignPrivateEvents.error && foreignPrivateEvents.data.length === 0, "private participant realtime event leaked");
    await rpc(hostClient, "kick_multiplayer_lobby_opponent", { requested_lobby_id: privateLobby.lobbyId }, "private host kick");
    const kickedContext = await rpc(opponentClient, "get_current_multiplayer_context", {}, "kicked context restore");
    assert(kickedContext === null, "kicked opponent retained canonical lobby membership");
    await rpc(hostClient, "leave_multiplayer_lobby", { requested_lobby_id: privateLobby.lobbyId }, "private host close");
    const closedCode = await thirdClient.rpc("join_multiplayer_lobby", { requested_private_code: privateLobby.privateCode });
    assert(Boolean(closedCode.error), "closed private code remained usable");

    const publicLobby = await rpc(hostClient, "create_multiplayer_lobby", lobbyInput, "public lobby create");
    const hostHeartbeat = await rpc(hostClient, "heartbeat_multiplayer_lobby", {
      requested_lobby_id: publicLobby.lobbyId,
    }, "host lobby heartbeat");
    assert(hostHeartbeat.lobbyId === publicLobby.lobbyId, "host heartbeat changed lobby identity");
    const forgedHeartbeat = await opponentClient.rpc("heartbeat_multiplayer_lobby", {
      requested_lobby_id: publicLobby.lobbyId,
    });
    assert(Boolean(forgedHeartbeat.error), "non-host refreshed the host lease");
    listing = await rpc(thirdClient, "list_open_multiplayer_lobbies", {}, "public listing");
    assert(listing.some((entry) => entry.lobby_id === publicLobby.lobbyId), "waiting public lobby is hidden");
    assert(listing.every((entry) => !("private_code" in entry)), "public listing leaked private code");

    await rpc(opponentClient, "join_multiplayer_lobby", { requested_lobby_id: publicLobby.lobbyId }, "opponent join");
    listing = await rpc(thirdClient, "list_open_multiplayer_lobbies", {}, "listing after join");
    assert(!listing.some((entry) => entry.lobby_id === publicLobby.lobbyId), "ready lobby remained public");
    const thirdJoin = await thirdClient.rpc("join_multiplayer_lobby", { requested_lobby_id: publicLobby.lobbyId });
    assert(Boolean(thirdJoin.error), "third player occupied a ready lobby");
    const opponentKick = await opponentClient.rpc("kick_multiplayer_lobby_opponent", { requested_lobby_id: publicLobby.lobbyId });
    assert(Boolean(opponentKick.error), "opponent used host kick authority");
    await rpc(hostClient, "kick_multiplayer_lobby_opponent", { requested_lobby_id: publicLobby.lobbyId }, "host kick");
    listing = await rpc(thirdClient, "list_open_multiplayer_lobbies", {}, "listing after kick");
    assert(listing.some((entry) => entry.lobby_id === publicLobby.lobbyId), "kicked lobby did not return to listing");
    await rpc(opponentClient, "join_multiplayer_lobby", { requested_lobby_id: publicLobby.lobbyId }, "opponent rejoin");

    const opponentStart = await opponentClient.rpc("request_multiplayer_match_start", { requested_lobby_id: publicLobby.lobbyId });
    assert(Boolean(opponentStart.error), "opponent started host lobby");
    const matchId = await rpc(hostClient, "request_multiplayer_match_start", { requested_lobby_id: publicLobby.lobbyId }, "host start intent");
    const replayMatchId = await rpc(hostClient, "request_multiplayer_match_start", { requested_lobby_id: publicLobby.lobbyId }, "start replay");
    assert(matchId === replayMatchId, "start replay created a second match");
    const participantSnapshot = await rpc(opponentClient, "get_multiplayer_match_snapshot", { requested_match_id: matchId }, "participant snapshot");
    assert(participantSnapshot.status === "initializing" && participantSnapshot.revision === 0, "start boundary is not initializing");
    const foreignSnapshot = await thirdClient.rpc("get_multiplayer_match_snapshot", { requested_match_id: matchId });
    assert(Boolean(foreignSnapshot.error), "non-participant read match snapshot");

    const activate = await hostClient.rpc("activate_multiplayer_match", { requested_match_id: matchId, trusted_initial_state: {} });
    assert(Boolean(activate.error), "browser invoked trusted match activation");
    const forgedLobby = await hostClient.from("multiplayer_lobbies")
      .update({ status: "closed", host_lease_expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      .eq("lobby_id", publicLobby.lobbyId);
    const forgedMatch = await hostClient.from("multiplayer_matches").update({ status: "active", revision: 999 }).eq("match_id", matchId);
    assert(Boolean(forgedLobby.error) && Boolean(forgedMatch.error), "browser directly mutated authority tables");
    const forgedEvent = await hostClient.from("multiplayer_lobby_events").insert({ scope: "public-list", event_kind: "created" });
    assert(Boolean(forgedEvent.error), "browser inserted a forged lobby event");

    console.log("MULTIPLAYER-01A REMOTE SECURITY");
    console.log("Private code/visibility/closure....... PASS");
    console.log("Public waiting visibility............. PASS");
    console.log("Ready lobby hidden.................... PASS");
    console.log("Atomic third join..................... PASS (denied)");
    console.log("Host kick authorization............... PASS");
    console.log("Host-only idempotent Start............ PASS");
    console.log("Participant snapshot isolation........ PASS");
    console.log("Trusted activation from browser....... PASS (denied)");
    console.log("Direct authority-table mutation....... PASS (denied)");
    console.log("Canonical lobby restoration........... PASS");
    console.log("Caller-bound bounded host heartbeat... PASS");
    console.log("Realtime event privacy/mutation....... PASS");
    console.log("\nDisposable Auth users (manual Dashboard cleanup required):");
    console.log(`Host: ${host.authUserId}`);
    console.log(`Opponent: ${opponent.authUserId}`);
    console.log(`Third: ${third.authUserId}`);
  } finally {
    await Promise.allSettled([hostClient.auth.signOut(), opponentClient.auth.signOut(), thirdClient.auth.signOut()]);
  }
}

run().catch((error) => {
  console.error(`MULTIPLAYER-01A REMOTE SECURITY FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
