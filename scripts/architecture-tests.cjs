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
  if (file.startsWith(path.join("src", "domain")) && /["']\.\.\/\.\.\/engine\//.test(source)) {
    violations.push(`${file}: domain-to-engine dependency`);
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
].filter(([pattern]) => pattern.test(boardSource)).map(([, label]) => label);

assert.deepEqual(
  migratedBoardMutationViolations,
  [],
  `Migrated Board action violations:\n${migratedBoardMutationViolations.join("\n")}`,
);
console.log(`Architecture boundaries passed: ${sourceFiles.length} domain/application/engine files checked.`);
console.log("Board selection and move mutations are routed through MatchSession.");
