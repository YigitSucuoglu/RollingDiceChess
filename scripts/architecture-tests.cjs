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
    || !/player_auth_owners/.test(trustedMultiplayerApi)) {
  violations.push("api/multiplayer.ts: missing server secret, verified token, or canonical PlayerId boundary");
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
