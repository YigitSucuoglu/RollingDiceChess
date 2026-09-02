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
    "src/settings/AppSettings.ts",
    "src/settings/AppSettingsRepository.ts",
    "src/settings/LocalStorageAppSettingsRepository.ts",
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

function createMemoryStorage(
  initialValue = null,
  initialKey = "roulettechess.player-profile.v1"
) {
  const values = new Map();
  if (initialValue !== null) {
    values.set(initialKey, initialValue);
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
  const settingsModel = require(path.join(
    outputRoot,
    "settings",
    "AppSettings.js"
  ));
  const { LocalStorageAppSettingsRepository } = require(path.join(
    outputRoot,
    "settings",
    "LocalStorageAppSettingsRepository.js"
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

  const noLevelUp = progression.createMatchXpProgressionResult(20, 50);
  assert.equal(noLevelUp.previous.currentLevelXp, 20);
  assert.equal(noLevelUp.current.currentLevelXp, 70);
  assert.equal(noLevelUp.segments.length, 1);
  assert.equal(noLevelUp.segments[0].fromXp, 20);
  assert.equal(noLevelUp.segments[0].toXp, 70);

  const oneLevelUp = progression.createMatchXpProgressionResult(70, 50);
  assert.equal(oneLevelUp.current.level, 2);
  assert.equal(oneLevelUp.current.currentLevelXp, 20);
  assert.deepEqual(
    oneLevelUp.segments.map((segment) => [
      segment.level,
      segment.fromXp,
      segment.toXp,
      segment.requiredXp,
    ]),
    [
      [1, 70, 100, 100],
      [2, 0, 20, 130],
    ]
  );

  const multiLevel = progression.createMatchXpProgressionResult(90, 400);
  assert.ok(multiLevel.segments.length > 2);
  assert.equal(
    multiLevel.segments.at(-1).toXp,
    multiLevel.current.currentLevelXp
  );
  assert.equal(
    multiLevel.segments.at(-1).requiredXp,
    multiLevel.current.requiredXp
  );

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

  const blockedStorage = {
    getItem: () => { throw new Error("storage blocked"); },
    setItem: () => { throw new Error("storage blocked"); },
    removeItem: () => { throw new Error("storage blocked"); },
  };
  const blockedRepository = new LocalStoragePlayerProfileRepository(blockedStorage);
  assert.doesNotThrow(() => blockedRepository.getProfile());
  assert.doesNotThrow(() => blockedRepository.saveProfile(defaultProfile));
  assert.doesNotThrow(() => blockedRepository.resetProfile());

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
  const gameSession = service.createGameSession(setup);
  const sink = gameSession.eventSink;
  sink.onRoll("white", ["knight", "knight", "pawn"]);
  sink.onRoll("white", ["pawn", "pawn", "pawn"]);
  sink.onRoll("white", ["knight", "knight", "knight"]);
  sink.onRoll("white", ["queen", "queen", "queen"]);
  sink.onRoll("white", ["bishop", "bishop", "bishop"]);
  sink.onRoll("white", ["rook", "rook", "rook"]);
  sink.onRoll("white", ["king", "king", "king"]);
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
  assert.equal(completed.statistics.rouletteRolls, 8);
  assert.equal(completed.statistics.rollsByPiece.knight, 5);
  assert.equal(completed.statistics.triplePawnRolls, 1);
  assert.equal(completed.statistics.tripleKnightRolls, 1);
  assert.equal(completed.statistics.tripleQueenRolls, 1);
  assert.equal(completed.statistics.tripleBishopRolls, 1);
  assert.equal(completed.statistics.tripleRookRolls, 1);
  assert.equal(completed.statistics.tripleKingRolls, 1);
  assert.equal(completed.statistics.movesByPiece.knight, 1);
  assert.equal(completed.statistics.movesByPiece.queen, 0);
  assert.equal(completed.statistics.capturesByPiece.knight, 1);
  assert.equal(completed.statistics.playerTurnsCompleted, 1);
  assert.equal(completed.statistics.threeRightsTurns, 1);
  assert.equal(completed.totalXp, 50);
  const resultProgression = gameSession.getXpProgressionResult();
  assert.equal(resultProgression.earnedXp, 50);
  assert.equal(resultProgression.previous.currentLevelXp, 0);
  assert.equal(resultProgression.current.currentLevelXp, 50);

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
  const resetViewModel = service.resetProfile();
  assert.equal(resetViewModel.progression.level, 1);
  assert.equal(service.getProfile().statistics.gamesPlayed, 0);

  const settingsStorage = createMemoryStorage();
  const settingsRepository = new LocalStorageAppSettingsRepository(
    settingsStorage
  );
  assert.equal(settingsRepository.getSettings().language, "en");
  settingsRepository.saveSettings({ schemaVersion: 1, language: "tr" });
  assert.equal(settingsRepository.getSettings().language, "tr");
  assert.equal(settingsModel.normalizeAppLanguage("unknown"), "en");

  const corruptSettingsRepository =
    new LocalStorageAppSettingsRepository(createMemoryStorage(
      "{broken",
      "roulettechess.settings.v1"
    ));
  assert.equal(corruptSettingsRepository.getSettings().language, "en");

  console.log("PROFILE/SETTINGS checks passed: progression, rewards, repositories, reset, statistics, idempotency.");
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}
