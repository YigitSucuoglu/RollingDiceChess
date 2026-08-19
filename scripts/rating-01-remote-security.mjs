import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT_URL = "https://kbtnnknsgobfvyydxbex.supabase.co";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createIsolatedClient(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function signInGuest(client, label) {
  const result = await client.auth.signInAnonymously();
  if (result.error || !result.data.user) {
    throw new Error(`${label} sign-in failed: ${result.error?.message ?? "missing user"}`);
  }
  const ownership = await client.from("player_auth_owners").select("player_id").single();
  if (ownership.error) throw new Error(`${label} ownership failed: ${ownership.error.message}`);
  return { authUserId: result.data.user.id, playerId: ownership.data.player_id };
}

async function readRating(client, label) {
  const result = await client.from("player_ratings")
    .select("multiplayer_rating,rated_games,rating_version").single();
  if (result.error) throw new Error(`${label} rating read failed: ${result.error.message}`);
  return result.data;
}

async function run() {
  if ((!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
      && existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing Supabase publishable configuration.");
  if (url !== EXPECTED_PROJECT_URL) throw new Error(`Refusing unexpected project: ${url}`);

  const clientA = createIsolatedClient(url, key);
  const clientB = createIsolatedClient(url, key);
  let identityA;
  let identityB;
  try {
    identityA = await signInGuest(clientA, "A");
    identityB = await signInGuest(clientB, "B");
    const beforeA = await readRating(clientA, "A before attacks");
    const beforeB = await readRating(clientB, "B before attacks");
    assert(beforeA.multiplayer_rating === 1000 && beforeB.multiplayer_rating === 1000,
      "new-player rating default is not 1000");

    const ownWrite = await clientA.from("player_ratings")
      .update({ multiplayer_rating: 999999 }).eq("player_id", identityA.playerId);
    assert(Boolean(ownWrite.error), "browser changed its own rating");
    const opponentWrite = await clientA.from("player_ratings")
      .update({ multiplayer_rating: 1 }).eq("player_id", identityB.playerId);
    assert(Boolean(opponentWrite.error), "browser changed an opponent rating");
    const insert = await clientA.from("player_ratings").insert({
      player_id: crypto.randomUUID(), multiplayer_rating: 999999,
    });
    assert(Boolean(insert.error), "browser inserted an arbitrary rating");
    const remove = await clientA.from("player_ratings")
      .delete().eq("player_id", identityA.playerId);
    assert(Boolean(remove.error), "browser deleted its rating");

    const settlementAttempt = await clientA.rpc("settle_ranked_match", {
      requested_match_id: crypto.randomUUID(),
      requested_match_mode: "multiplayer-ranked",
      requested_player_a_id: identityA.playerId,
      requested_player_b_id: identityB.playerId,
      requested_winner_id: identityA.playerId,
      requested_termination_reason: "normal",
    });
    assert(Boolean(settlementAttempt.error), "browser invoked trusted settlement");
    const ledgerAttempt = await clientA.from("rating_settlements").insert({
      match_id: crypto.randomUUID(),
    });
    assert(Boolean(ledgerAttempt.error), "browser inserted fake rating history");

    const afterA = await readRating(clientA, "A after attacks");
    const afterB = await readRating(clientB, "B after attacks");
    assert(JSON.stringify(afterA) === JSON.stringify(beforeA), "A rating changed after attacks");
    assert(JSON.stringify(afterB) === JSON.stringify(beforeB), "B rating changed after attacks");

    console.log("RATING-01 REMOTE SECURITY");
    console.log("Starting rating........................ PASS (1000)");
    console.log("Own/cross direct mutation............ PASS (denied)");
    console.log("Trusted settlement from browser...... PASS (denied)");
    console.log("Fake audit history.................... PASS (denied)");
    console.log("Ratings after malicious attempts..... PASS (unchanged)");
    console.log("\nDisposable Auth users (manual Dashboard cleanup required):");
    console.log(`Client A: ${identityA.authUserId}`);
    console.log(`Client B: ${identityB.authUserId}`);
  } finally {
    await Promise.allSettled([clientA.auth.signOut(), clientB.auth.signOut()]);
  }
}

run().catch((error) => {
  console.error(`RATING-01 REMOTE SECURITY FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
