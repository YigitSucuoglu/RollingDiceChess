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
