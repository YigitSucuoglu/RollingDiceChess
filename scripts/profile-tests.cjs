const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "roulette-profile-"));
const compiler = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc"
);

function compileProfileModules() {
  const sources = [
    "src/profile/PlayerProfile.ts",
    "src/profile/ProfileProgression.ts",
    "src/profile/PlayerProfileRepository.ts",
    "src/profile/LocalStoragePlayerProfileRepository.ts",
    "src/profile/PlayerProfileService.ts",
  ];
  const compilerArguments = [
      "--ignoreConfig",
      "--target",
      "ES2023",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--ignoreDeprecations",
      "6.0",
      "--skipLibCheck",
      "--rootDir",
      "src",
      "--outDir",
      outputRoot,
      ...sources,
    ];
  const isWindows = process.platform === "win32";
  const executable = isWindows ? process.env.ComSpec : compiler;
  const arguments = isWindows
    ? ["/d", "/s", "/c", compiler, ...compilerArguments]
    : compilerArguments;
  const result = spawnSync(executable, arguments, {
    cwd: projectRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stdout + result.stderr);
  }
}

function createMemoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) {
    values.set("roulettechess.player-profile.v1", initialValue);
  }

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

try {
  compileProfileModules();

  const progression = require(path.join(
    outputRoot,
    "profile",
    "ProfileProgression.js"
  ));
  const profileModel = require(path.join(
    outputRoot,
    "profile",
    "PlayerProfile.js"
  ));
  const { LocalStoragePlayerProfileRepository } = require(path.join(
    outputRoot,
    "profile",
    "LocalStoragePlayerProfileRepository.js"
  ));
  const { PlayerProfileService } = require(path.join(
    outputRoot,
    "profile",
    "PlayerProfileService.js"
  ));

  const levelCases = [
    [0, 1, 0, 100],
    [99, 1, 99, 100],
    [100, 2, 0, 130],
    [135, 2, 35, 130],
    [-20, 1, 0, 100],
  ];
  for (const [xp, level, current, required] of levelCases) {
    const result = progression.calculateLevelProgression(xp);
    assert.equal(result.level, level);
    assert.equal(result.currentLevelXp, current);
    assert.equal(result.requiredXp, required);
  }
  assert.ok(progression.calculateLevelProgression(10_000_000).level > 100);

  const titleCases = [
    [1, "Novice"],
    [9, "Novice"],
    [10, "Apprentice"],
    [19, "Apprentice"],
    [20, "Strategist"],
    [40, "Mastermind"],
    [60, "Grandmaster"],
    [80, "Legend"],
    [100, "Roulette Master"],
  ];
  for (const [level, title] of titleCases) {
    assert.equal(progression.resolvePlayerTitle(level), title);
  }

  const rewardCases = [
    [{ won: true, promotions: 0, currentWinStreak: 1, difficulty: "medium" }, 50],
    [{ won: false, promotions: 0, currentWinStreak: 0, difficulty: "medium" }, 25],
    [{ won: true, promotions: 0, currentWinStreak: 1, difficulty: "easy" }, 40],
    [{ won: true, promotions: 0, currentWinStreak: 1, difficulty: "hard" }, 60],
    [{ won: true, promotions: 1, currentWinStreak: 1, difficulty: "medium" }, 60],
    [{ won: true, promotions: 1, currentWinStreak: 3, difficulty: "medium" }, 70],
    [{ won: true, promotions: 1, currentWinStreak: 3, difficulty: "hard" }, 84],
  ];
  for (const [input, expected] of rewardCases) {
    assert.equal(progression.calculateXpReward(input).finalXp, expected);
  }

  const emptyStorage = createMemoryStorage();
  const repository = new LocalStoragePlayerProfileRepository(emptyStorage);
  const defaultProfile = repository.getProfile();
  assert.equal(defaultProfile.schemaVersion, 1);
  assert.equal(defaultProfile.totalXp, 0);
  defaultProfile.totalXp = 135;
  repository.saveProfile(defaultProfile);
  assert.equal(repository.getProfile().totalXp, 135);
  const resetProfile = repository.resetProfile();
  assert.equal(resetProfile.totalXp, 0);
  assert.notEqual(resetProfile.playerId, defaultProfile.playerId);

  const corruptRepository = new LocalStoragePlayerProfileRepository(
    createMemoryStorage("{not-json")
  );
  assert.equal(corruptRepository.getProfile().statistics.gamesPlayed, 0);

  const partialRepository = new LocalStoragePlayerProfileRepository(
    createMemoryStorage(JSON.stringify({
      schemaVersion: 1,
      displayName: "Veteran",
      totalXp: 50,
      statistics: { wins: 2 },
    }))
  );
  const migrated = partialRepository.getProfile();
  assert.equal(migrated.displayName, "Veteran");
  assert.equal(migrated.statistics.wins, 2);
  assert.equal(migrated.statistics.losses, 0);

  const serviceStorage = createMemoryStorage();
  const serviceRepository = new LocalStoragePlayerProfileRepository(
    serviceStorage
  );
  const service = new PlayerProfileService(serviceRepository);
  const setup = {
    playerColor: "white",
    botColor: "black",
    opponentType: "bot",
    botDifficulty: "medium",
    pieceSet: "gold",
    boardTheme: "default",
    timeControl: {
      id: "test",
      label: "5+0",
      category: "blitz",
      initialMinutes: 5,
      incrementSeconds: 0,
    },
  };
  const sink = service.createGameEventSink(setup);
  sink.onRoll("white", ["knight", "knight", "pawn"]);
  sink.onRoll("white", ["pawn", "pawn", "pawn"]);
  sink.onRoll("white", ["knight", "knight", "knight"]);
  sink.onRoll("white", ["queen", "queen", "queen"]);
  sink.onRoll("white", ["rook", "rook", "bishop"]);
  sink.onRoll("black", ["queen", "queen", "queen"]);
  sink.onMove({
    color: "white",
    pieceType: "knight",
    isCapture: true,
    isPromotion: false,
  });
  sink.onMove({
    color: "black",
    pieceType: "queen",
    isCapture: true,
    isPromotion: false,
  });
  sink.onTurnCompleted("white", 3);
  sink.onGameCompleted({ winner: "white", reason: "king-captured" });
  sink.onGameCompleted({ winner: "white", reason: "king-captured" });

  const completed = service.getProfile();
  assert.equal(completed.statistics.gamesPlayed, 1);
  assert.equal(completed.statistics.wins, 1);
  assert.equal(completed.statistics.kingsCaptured, 1);
  assert.equal(completed.statistics.rouletteRolls, 5);
  assert.equal(completed.statistics.rollsByPiece.knight, 5);
  assert.equal(completed.statistics.triplePawnRolls, 1);
  assert.equal(completed.statistics.tripleKnightRolls, 1);
  assert.equal(completed.statistics.tripleQueenRolls, 1);
  assert.equal(completed.statistics.movesByPiece.knight, 1);
  assert.equal(completed.statistics.movesByPiece.queen, 0);
  assert.equal(completed.statistics.capturesByPiece.knight, 1);
  assert.equal(completed.statistics.playerTurnsCompleted, 1);
  assert.equal(completed.statistics.threeRightsTurns, 1);
  assert.equal(completed.totalXp, 50);

  const lossSink = service.createGameEventSink(setup);
  lossSink.onMove({
    color: "white",
    pieceType: "pawn",
    isCapture: false,
    isPromotion: true,
  });
  lossSink.onGameCompleted({ winner: "black", reason: "timeout" });
  const afterLoss = service.getProfile();
  assert.equal(afterLoss.statistics.gamesPlayed, 2);
  assert.equal(afterLoss.statistics.losses, 1);
  assert.equal(afterLoss.statistics.currentWinStreak, 0);
  assert.equal(afterLoss.statistics.bestWinStreak, 1);
  assert.equal(afterLoss.statistics.kingsCaptured, 1);
  assert.equal(afterLoss.totalXp, 85);
  assert.equal(
    service.getViewModel().generalStats.find(
      (stat) => stat.label === "Win Rate"
    ).value,
    "50%"
  );

  assert.equal(
    profileModel.PLAYER_PROFILE_SCHEMA_VERSION,
    1
  );
  console.log("PROFILE-01 checks passed: progression, rewards, repository, statistics, idempotency.");
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}
