const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const roots = ["src/domain", "src/application", "src/engine"];
const sourceFiles = roots.flatMap((root) => fs.existsSync(root)
  ? fs.readdirSync(root, { recursive: true })
      .filter((file) => /\.(?:ts|tsx)$/.test(file))
      .map((file) => path.join(root, file))
  : []);
const violations = [];
const authProviderImportPattern = /from\s+["'](?:firebase|@firebase|@supabase|@auth0|@clerk|next-auth)(?:\/|["'])/;

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  const forbidden = [
    [/from\s+["']react(?:\/|["'])/, "React import"],
    [/["'][^"']*(?:pages|components)\//, "presentation import"],
    [/\blocalStorage\b|\bsessionStorage\b/, "browser storage"],
    [/\bwindow\.|\bdocument\./, "DOM global"],
    [/import\s+[^;]*\.(?:css|scss)["']/, "style import"],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) violations.push(`${file}: ${label}`);
  }
  if (authProviderImportPattern.test(source)) {
    violations.push(`${file}: authentication provider SDK import`);
  }
  if (file.startsWith(path.join("src", "domain")) && /["']\.\.\/\.\.\/engine\//.test(source)) {
    violations.push(`${file}: domain-to-engine dependency`);
  }
}

const authContractFiles = [
  "src/application/auth/AuthenticationContracts.ts",
  "src/application/auth/AuthenticationPort.ts",
  "src/application/accounts/ProfileOwnership.ts",
  "src/application/accounts/AccountMigration.ts",
  "src/application/players/PlayerContracts.ts",
  "src/application/players/PlayerProfilePort.ts",
];
for (const file of authContractFiles) {
  const source = fs.readFileSync(file, "utf8");
  const forbidden = [
    [/from\s+["']react(?:\/|["'])/, "React import"],
    [/\blocalStorage\b|\bsessionStorage\b/, "browser storage"],
    [/\bwindow\.|\bdocument\./, "DOM global"],
    [authProviderImportPattern, "authentication provider SDK import"],
    [/\b(?:accessToken|refreshToken|oauthToken|password|providerPayload)\b/, "credential/provider field"],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) violations.push(`${file}: ${label}`);
  }
}

const matchContracts = fs.readFileSync("src/domain/contracts/MatchContracts.ts", "utf8");
if (/\b(?:accessToken|refreshToken|oauthToken|password|providerPayload)\b/.test(matchContracts)) {
  violations.push("src/domain/contracts/MatchContracts.ts: authentication credential/provider field");
}

const allSourceFiles = fs.readdirSync("src", { recursive: true })
  .filter((file) => /\.(?:ts|tsx)$/.test(file))
  .map((file) => path.join("src", file));
for (const file of allSourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (/scripts\/admin|supabase\/admin/.test(source)) {
    violations.push(`${file}: browser/application source imports destructive admin tooling`);
  }
  if (/@supabase\/supabase-js/.test(source)
      && !file.startsWith(path.join("src", "infrastructure"))) {
    violations.push(`${file}: Supabase SDK outside infrastructure`);
  }
  if (/VITE_SUPABASE_(?:SERVICE_ROLE|SECRET)|SUPABASE_SERVICE_ROLE/.test(source)) {
    violations.push(`${file}: forbidden Supabase secret/service-role identifier`);
  }
  if ((file.startsWith(path.join("src", "domain"))
      || file.startsWith(path.join("src", "engine")))
      && /application\/players|infrastructure\/.*player/i.test(source)) {
    violations.push(`${file}: gameplay layer imports player persistence`);
  }
}

const playerPort = fs.readFileSync("src/application/players/PlayerProfilePort.ts", "utf8");
if (/rating|multiplayerRating/i.test(playerPort.replace(/\/\/.*rating.*$/gim, ""))) {
  violations.push("src/application/players/PlayerProfilePort.ts: browser rating mutation surface");
}

const leaderboardContracts = fs.readFileSync(
  "src/application/leaderboard/LeaderboardContracts.ts",
  "utf8",
);
const leaderboardService = fs.readFileSync(
  "src/application/leaderboard/LeaderboardService.ts",
  "utf8",
);
const leaderboardPage = fs.readFileSync("src/pages/LeaderboardPage.tsx", "utf8");
const leaderboardAdapter = fs.readFileSync(
  "src/infrastructure/leaderboard/SupabaseLeaderboardAdapter.ts",
  "utf8",
);
if (/\b(?:playerId|player_id|authUserId|auth_user_id)\b/.test(leaderboardContracts)) {
  violations.push("leaderboard public contract: internal identity field");
}
if (/@supabase\/supabase-js|\.rpc\s*\(/.test(`${leaderboardService}\n${leaderboardPage}`)) {
  violations.push("leaderboard application/UI bypasses its read adapter");
}
if (/\.from\s*\(|rating_settlements|player_auth_owners|player_ratings/.test(leaderboardAdapter)) {
  violations.push("leaderboard adapter reads protected tables directly");
}
for (const rpcName of [
  "get_ranked_leaderboard_top_100",
  "get_current_player_ranked_rank",
]) {
  if (!leaderboardAdapter.includes(`client.rpc(\"${rpcName}\")`)) {
    violations.push(`leaderboard adapter: missing approved read RPC ${rpcName}`);
  }
}

const trustedMultiplayerApi = fs.readFileSync("api/multiplayer.ts", "utf8");
const trustedRuntimeImports = [...trustedMultiplayerApi.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)]
  .map((match) => match[1]);
for (const importPath of trustedRuntimeImports) {
  if (!importPath.endsWith(".js")) {
    violations.push(`api/multiplayer.ts: Node ESM relative import lacks .js extension: ${importPath}`);
  }
}
const serverTsconfig = JSON.parse(fs.readFileSync("tsconfig.server.json", "utf8"));
if (serverTsconfig.compilerOptions?.module !== "NodeNext"
    || serverTsconfig.compilerOptions?.moduleResolution !== "NodeNext") {
  violations.push("tsconfig.server.json: trusted runtime must use NodeNext ESM resolution");
}
if (/VITE_SUPABASE_|SUPABASE_SERVICE_ROLE_KEY/.test(trustedMultiplayerApi)) {
  violations.push("api/multiplayer.ts: trusted runtime uses a browser or legacy service-role variable");
}
if (!/process\.env\.SUPABASE_SECRET_KEY/.test(trustedMultiplayerApi)
    || !/client\.auth\.getUser\(accessToken\)/.test(trustedMultiplayerApi)
    || !/trusted_resolve_multiplayer_player/.test(trustedMultiplayerApi)) {
  violations.push("api/multiplayer.ts: missing server secret, verified token, or canonical PlayerId boundary");
}
if (/\.from\(["']player_auth_owners["']\)/.test(trustedMultiplayerApi)) {
  violations.push("api/multiplayer.ts: trusted runtime bypasses the narrow player resolver RPC");
}
if (/console\.(?:log|error|warn)|response[^\n]+(?:secret|accessToken)/i.test(trustedMultiplayerApi)) {
  violations.push("api/multiplayer.ts: credential-bearing logging or response risk");
}
if (!trustedMultiplayerApi.includes("trusted_recover_legacy_multiplayer_match")
    || !trustedMultiplayerApi.includes("resolveCallerPlayerId")) {
  violations.push("api/multiplayer.ts: legacy recovery must stay behind verified trusted identity");
}
if (!trustedMultiplayerApi.includes("trusted_reconcile_multiplayer_state")
    || !trustedMultiplayerApi.includes('action === "reconcile"')) {
  violations.push("api/multiplayer.ts: canonical stale-state reconciliation must remain in trusted runtime");
}
const staleMembershipMigration = fs.readFileSync(
  "supabase/migrations/202608200005_multiplayer_01c_hf2_stale_membership_recovery.sql",
  "utf8",
);
const trustedPlayerResolutionMigration = fs.readFileSync(
  "supabase/migrations/202608210001_multiplayer_01c_hf2_trusted_player_resolution.sql",
  "utf8",
);
const triggerEnumCastMigration = fs.readFileSync(
  "supabase/migrations/202608210002_multiplayer_01c_hf2_trigger_enum_cast_fix.sql",
  "utf8",
);
for (const invariant of [
  "new.status::text in ('terminal', 'technical-abort')",
  "new.status::text = 'closed'",
]) {
  if (!triggerEnumCastMigration.includes(invariant)) {
    violations.push(`multiplayer cleanup trigger migration: missing enum-safe comparison ${invariant}`);
  }
}
for (const invariant of [
  "auth.role() <> 'service_role'",
  "public.player_auth_owners",
  "player.lifecycle = 'active'",
  "from public, anon, authenticated",
  "to service_role",
]) {
  if (!trustedPlayerResolutionMigration.includes(invariant)) {
    violations.push(`trusted player resolver migration: missing security guard ${invariant}`);
  }
}
for (const invariant of [
  "auth.role() <> 'service_role'",
  "requested_caller_player_id not in (match_row.player_a_id, match_row.player_b_id)",
  "match_row.updated_at >= now() - interval '5 minutes'",
  "match_row.canonical_state is not null",
  "release_terminal_match_membership",
  "release_closed_lobby_membership",
]) {
  if (!staleMembershipMigration.includes(invariant)) {
    violations.push(`stale membership migration: missing recovery guard ${invariant}`);
  }
}
const legacyRecoveryMigration = fs.readFileSync(
  "supabase/migrations/202608200004_multiplayer_01c_hf1_legacy_recovery.sql",
  "utf8",
);
for (const invariant of [
  "auth.role() <> 'service_role'",
  "requested_caller_player_id not in (match_row.player_a_id, match_row.player_b_id)",
  "match_row.status <> 'initializing'",
  "match_row.canonical_state is not null",
  "match_row.created_at >= now() - interval '5 minutes'",
]) {
  if (!legacyRecoveryMigration.includes(invariant)) {
    violations.push(`legacy recovery migration: missing narrow guard ${invariant}`);
  }
}

const rankedLeaderboardMigration = fs.readFileSync(
  "supabase/migrations/202608310003_leaderboard_01_ranked_projection.sql",
  "utf8",
);
for (const invariant of [
  "rating.rated_games <> coalesce(ledger.games, 0)",
  "raise exception\n      'ranked projection backfill refused",
  "ranked_win_rate numeric generated always",
  "check (rated_games = ranked_wins + ranked_losses)",
  "player_ratings_leaderboard_rank_idx",
  "where rated_games >= 1",
  "if existing.match_id is not null then",
  "ranked_wins = rating.ranked_wins",
  "ranked_losses = rating.ranked_losses",
  "private.current_player_id()",
  "get_ranked_leaderboard_top_100",
  "get_current_player_ranked_rank",
  "from public, anon, authenticated",
  "to authenticated",
]) {
  if (!rankedLeaderboardMigration.toLowerCase().includes(invariant.toLowerCase())) {
    violations.push(`ranked leaderboard projection: missing authority invariant ${invariant}`);
  }
}
const leaderboardReturnSignature = rankedLeaderboardMigration
  .slice(rankedLeaderboardMigration.indexOf(
    "create or replace function public.get_ranked_leaderboard_top_100",
  ))
  .match(/returns table \(([\s\S]*?)\) language/i)?.[1] ?? "";
if (/\b(?:player_id|auth_user_id)\b/i.test(leaderboardReturnSignature)) {
  violations.push("ranked leaderboard projection: public Top 100 DTO leaks an internal identity field");
}

assert.deepEqual(violations, [], `Architecture boundary violations:\n${violations.join("\n")}`);

const boardSource = fs.readFileSync("src/components/Board/Board.tsx", "utf8");
const migratedBoardMutationViolations = [
  [/\bgame\.selectSquare\s*\(/, "Board directly calls Game.selectSquare"],
  [/\bgame\.makeMove\s*\(/, "Board directly calls Game.makeMove"],
  [/\bgame\.startClockForCurrentTurn\s*\(/, "Board starts the clock from roll resolution"],
  [/\bsetRollAnimation\b|\brollAnimation\b/, "Board owns canonical roll lifecycle state"],
  [/\bROLL_TIMING\.durationMs\b/, "Board owns the roll-resolution timeout"],
  [/\bDiceEngine\b/, "Board accesses DiceEngine"],
  [/\bBotFactory\b/, "Board accesses BotFactory"],
  [/\bgame\.playBotTurn\s*\(/, "Board directly executes a bot turn"],
  [/\bstartAutomaticRollReveal\s*\(/, "Board decides when bot roll reveal starts"],
  [/\bbotTurnInProgressRef\b|\bbotTurnAbortControllerRef\b/, "Board owns bot lifecycle guards"],
  [/\bAUTOMATIC_ROLL_DELAY_MS\b|\bBOT_START_DELAY_MS\b/, "Board owns bot-start pacing"],
  [/\bgameManager\.getGame\s*\(/, "Board accesses the compatibility Game instance"],
  [/\bgame\.clock\b/, "Board accesses the mutable Game clock"],
  [/\bSKIP_UNPLAYABLE_TURN\b|\bskipUnplayableTurn\s*\(/, "Board owns skip progression"],
  [/\bUNPLAYABLE_ROLL_REVIEW_MS\b|\bTURN_SKIPPED_MESSAGE_MS\b/, "Board owns skip timers"],
  [/\bSTART_CLOCK\b/, "Board owns clock start intent"],
].filter(([pattern]) => pattern.test(boardSource)).map(([, label]) => label);

assert.deepEqual(
  migratedBoardMutationViolations,
  [],
  `Migrated Board action violations:\n${migratedBoardMutationViolations.join("\n")}`,
);
console.log(`Architecture boundaries passed: ${sourceFiles.length} domain/application/engine files checked.`);
console.log("Board gameplay orchestration is routed through MatchSession snapshots and actions.");
