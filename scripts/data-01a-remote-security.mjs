import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT_URL = "https://kbtnnknsgobfvyydxbex.supabase.co";
const PIECE_TYPES = ["pawn", "knight", "bishop", "rook", "queen", "king"];

export function isPermissionDenied(error) {
  if (!error) return false;
  return error.code === "42501" || /permission denied|row-level security/i.test(error.message ?? "");
}

export function assertPermissionDenied(label, result) {
  if (!isPermissionDenied(result.error)) {
    const detail = result.error ? `${result.error.code ?? "unknown"}: ${result.error.message}` : "mutation succeeded";
    throw new Error(`${label}: expected permission denial, received ${detail}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createIsolatedClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function createAnonymousIdentity(client, label) {
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw new Error(`${label} anonymous sign-in failed: ${error?.message ?? "missing session"}`);
  }
  assert(data.user.is_anonymous === true, `${label} is not marked anonymous`);
  return { authUserId: data.user.id, session: data.session };
}

async function readOwnState(client, identity, label) {
  const ownership = await client.from("player_auth_owners").select("auth_user_id,player_id").single();
  if (ownership.error) throw new Error(`${label} ownership read failed: ${ownership.error.message}`);
  assert(ownership.data.auth_user_id === identity.authUserId, `${label} ownership does not match auth user`);
  const playerId = ownership.data.player_id;

  const [player, progression, pieces, rating] = await Promise.all([
    client.from("players").select("player_id,display_name,lifecycle,ownership_kind").eq("player_id", playerId).single(),
    client.from("player_progression").select("*").eq("player_id", playerId).single(),
    client.from("player_piece_statistics").select("piece_type,rolls,moves,captures").eq("player_id", playerId),
    client.from("player_ratings").select("player_id,multiplayer_rating,rated_games,rating_version").eq("player_id", playerId).single(),
  ]);
  for (const [name, result] of [["player", player], ["progression", progression], ["pieces", pieces], ["rating", rating]]) {
    if (result.error) throw new Error(`${label} ${name} read failed: ${result.error.message}`);
  }
  assert(player.data.player_id === playerId, `${label} player mismatch`);
  assert(progression.data.player_id === playerId, `${label} progression mismatch`);
  assert(rating.data.multiplayer_rating === 1000, `${label} initial rating is not 1000`);
  assert(pieces.data.length === PIECE_TYPES.length, `${label} expected six piece rows`);
  assert(PIECE_TYPES.every((piece) => pieces.data.some((row) => row.piece_type === piece)), `${label} piece rows are incomplete`);
  return { playerId, displayName: player.data.display_name };
}

async function assertCrossReadsEmpty(client, foreignAuthUserId, foreignPlayerId, label) {
  const queries = [
    ["players", client.from("players").select("player_id").eq("player_id", foreignPlayerId)],
    ["player_auth_owners", client.from("player_auth_owners").select("player_id").eq("auth_user_id", foreignAuthUserId)],
    ["player_progression", client.from("player_progression").select("player_id").eq("player_id", foreignPlayerId)],
    ["player_piece_statistics", client.from("player_piece_statistics").select("player_id").eq("player_id", foreignPlayerId)],
    ["player_ratings", client.from("player_ratings").select("player_id").eq("player_id", foreignPlayerId)],
  ];
  for (const [table, promise] of queries) {
    const result = await promise;
    if (result.error) throw new Error(`${label} ${table} cross-read errored unexpectedly: ${result.error.message}`);
    assert(result.data.length === 0, `${label} read unauthorized ${table} rows`);
  }
}

async function assertDirectMutationsDenied(client, authUserId, ownPlayerId, foreignPlayerId) {
  assertPermissionDenied("direct player update", await client.from("players").update({ display_name: "Forged" }).eq("player_id", ownPlayerId));
  assertPermissionDenied("direct player insert", await client.from("players").insert({
    player_id: crypto.randomUUID(), display_name: "Forged", ownership_kind: "guest",
  }));
  assertPermissionDenied("direct player delete", await client.from("players").delete().eq("player_id", ownPlayerId));
  assertPermissionDenied("progression update", await client.from("player_progression").update({
    total_xp: 999999, games_played: 999999, wins: 999999,
  }).eq("player_id", ownPlayerId));
  assertPermissionDenied("own rating update", await client.from("player_ratings").update({
    multiplayer_rating: 999999,
  }).eq("player_id", ownPlayerId));
  assertPermissionDenied("cross-player rating update", await client.from("player_ratings").update({
    multiplayer_rating: 999999,
  }).eq("player_id", foreignPlayerId));
  assertPermissionDenied("ownership insert", await client.from("player_auth_owners").insert({
    auth_user_id: authUserId, player_id: foreignPlayerId,
  }));
  assertPermissionDenied("ownership update", await client.from("player_auth_owners").update({
    player_id: foreignPlayerId,
  }).eq("auth_user_id", authUserId));
}

function localBootstrapPayload(sourceProfileId) {
  const zeroPieces = Object.fromEntries(PIECE_TYPES.map((piece) => [piece, 0]));
  return {
    schemaVersion: 1,
    playerId: sourceProfileId,
    displayName: "Bootstrap Disposable",
    totalXp: 125,
    statistics: {
      gamesPlayed: 2, wins: 1, losses: 1, currentWinStreak: 0, bestWinStreak: 1,
      totalPlayTimeSeconds: 120, kingsCaptured: 1, rouletteRolls: 3,
      rollsByPiece: zeroPieces, movesByPiece: zeroPieces, capturesByPiece: zeroPieces,
      playerTurnsCompleted: 2, threeRightsTurns: 1, triplePawnRolls: 0,
      tripleKnightRolls: 0, tripleQueenRolls: 0,
    },
  };
}

async function run() {
  if ((!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) && existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.");
  if (url !== EXPECTED_PROJECT_URL) throw new Error(`Refusing unexpected Supabase project URL: ${url}`);

  const clientA = createIsolatedClient(url, key);
  const clientB = createIsolatedClient(url, key);
  let identityA;
  let identityB;
  const results = [];
  const pass = (name, detail = "PASS") => results.push([name, detail]);

  try {
    identityA = await createAnonymousIdentity(clientA, "A");
    pass("Anonymous A creation");
    identityB = await createAnonymousIdentity(clientB, "B");
    assert(identityA.authUserId !== identityB.authUserId, "Anonymous identities are not distinct");
    pass("Anonymous B creation");

    const ownA = await readOwnState(clientA, identityA, "A");
    pass("A own player read");
    const ownB = await readOwnState(clientB, identityB, "B");
    pass("B own player read");

    await assertCrossReadsEmpty(clientA, identityB.authUserId, ownB.playerId, "A -> B");
    pass("A -> B protected reads", "PASS (0 rows)");
    await assertCrossReadsEmpty(clientB, identityA.authUserId, ownA.playerId, "B -> A");
    pass("B -> A protected reads", "PASS (0 rows)");

    await assertDirectMutationsDenied(clientA, identityA.authUserId, ownA.playerId, ownB.playerId);
    pass("Direct player mutations", "PASS (denied)");
    pass("Progression mutation", "PASS (denied)");
    pass("Rating 999999", "PASS (denied)");
    pass("Cross-player rating", "PASS (denied)");
    pass("Ownership theft", "PASS (denied)");

    const afterAttacksA = await readOwnState(clientA, identityA, "A after attacks");
    const afterAttacksB = await readOwnState(clientB, identityB, "B after attacks");
    assert(afterAttacksA.playerId === ownA.playerId && afterAttacksB.playerId === ownB.playerId, "Player ownership changed after attacks");

    const bootstrapPayload = localBootstrapPayload(`remote-test-${ownB.playerId}`);
    const bootstrapFirst = await clientA.rpc("bootstrap_local_profile", { source_profile: bootstrapPayload });
    if (bootstrapFirst.error) throw new Error(`bootstrap failed: ${bootstrapFirst.error.message}`);
    const bootstrapReplay = await clientA.rpc("bootstrap_local_profile", { source_profile: bootstrapPayload });
    if (bootstrapReplay.error) throw new Error(`bootstrap replay failed: ${bootstrapReplay.error.message}`);
    assert(bootstrapFirst.data === ownA.playerId && bootstrapReplay.data === ownA.playerId, "bootstrap targeted another PlayerId");
    const [progressA, progressB, ratingA] = await Promise.all([
      clientA.from("player_progression").select("total_xp").single(),
      clientB.from("player_progression").select("total_xp").single(),
      clientA.from("player_ratings").select("multiplayer_rating").single(),
    ]);
    assert(!progressA.error && progressA.data.total_xp === 125, "bootstrap did not update caller progression");
    assert(!progressB.error && progressB.data.total_xp === 0, "bootstrap modified foreign progression");
    assert(!ratingA.error && ratingA.data.multiplayer_rating === 1000, "bootstrap modified rating");
    pass("Bootstrap isolation/idempotency");

    const sharedName = `Data01A-${Date.now().toString().slice(-8)}`;
    const renameA = await clientA.rpc("rename_current_player", { requested_name: sharedName });
    if (renameA.error) throw new Error(`A rename failed: ${renameA.error.message}`);
    assert(renameA.data.player_id === ownA.playerId, "A rename changed PlayerId");
    const renameB = await clientB.rpc("rename_current_player", { requested_name: sharedName });
    if (renameB.error) throw new Error(`B duplicate rename failed: ${renameB.error.message}`);
    assert(renameB.data.player_id === ownB.playerId, "B rename changed PlayerId");
    pass("Own rename / PlayerId preserved");
    pass("Duplicate display name");

    for (const invalidName of ["", "   ", "x".repeat(25), "Bad\u0007Name"]) {
      const invalid = await clientA.rpc("rename_current_player", { requested_name: invalidName });
      assert(Boolean(invalid.error), "invalid rename unexpectedly succeeded");
    }
    const forgedRename = await clientA.rpc("rename_current_player", {
      requested_name: "Forged Other", player_id: ownB.playerId,
    });
    assert(Boolean(forgedRename.error), "rename RPC accepted an arbitrary target PlayerId");
    const finalB = await clientB.from("players").select("display_name").single();
    assert(!finalB.error && finalB.data.display_name === sharedName, "B changed during cross-player rename attempt");
    pass("Invalid rename");
    pass("Cross-player rename boundary");

    const intentA = await clientA.rpc("create_guest_upgrade_intent");
    if (intentA.error) throw new Error(`Guest intent creation failed: ${intentA.error.message}`);
    const inspectAsGuest = await clientA.rpc("inspect_profile_conflict", { handoff_token: intentA.data[0].handoff_token });
    assert(Boolean(inspectAsGuest.error), "anonymous Guest inspected a permanent-account conflict");
    const resolveAsGuest = await clientA.rpc("resolve_profile_conflict", {
      handoff_token: intentA.data[0].handoff_token,
      requested_resolution: "USE_GUEST_PROFILE",
    });
    assert(Boolean(resolveAsGuest.error), "anonymous Guest executed conflict resolution");
    pass("Protected migration RPC caller checks");

    console.log("DATA-01A REMOTE SECURITY\n");
    for (const [name, result] of results) console.log(`${name.padEnd(34, ".")} ${result}`);
    console.log("Conflict RPC end-to-end".padEnd(34, ".") + " DEFERRED");
    console.log("Manual identity linking".padEnd(34, ".") + " DISABLED / DEFERRED");
    console.log("\nDisposable Auth users (manual Dashboard cleanup required):");
    console.log(`Client A: ${identityA.authUserId}`);
    console.log(`Client B: ${identityB.authUserId}`);
  } finally {
    await Promise.allSettled([clientA.auth.signOut(), clientB.auth.signOut()]);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  run().catch((error) => {
    console.error(`DATA-01A REMOTE SECURITY FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
