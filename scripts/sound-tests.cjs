const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "roulette-sound-"));
const compiler = path.join(projectRoot, "node_modules", ".bin", "tsc.cmd");

try {
  const result = spawnSync(process.env.ComSpec, [
    "/d", "/s", "/c", compiler,
    "--ignoreConfig", "--target", "ES2023", "--module", "commonjs",
    "--moduleResolution", "node", "--ignoreDeprecations", "6.0",
    "--skipLibCheck", "--rootDir", "src", "--outDir", outputRoot,
    "src/types/GameSound.ts", "src/config/sounds.ts", "src/services/SoundManager.ts",
  ], { cwd: projectRoot, encoding: "utf8" });

  if (result.status !== 0) throw new Error(result.stdout + result.stderr);

  const { SoundManager } = require(path.join(outputRoot, "services", "SoundManager.js"));
  const values = new Map();
  let createCalls = 0;
  const manager = new SoundManager({
    audioAdapter: {
      create() {
        createCalls++;
        throw new Error("Audio adapter must not be called without an asset");
      },
    },
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });

  assert.doesNotThrow(() => manager.play("move"));
  assert.doesNotThrow(() => manager.play("lever-pull"));
  assert.equal(createCalls, 0);
  assert.equal(manager.isEnabled(), true);
  manager.setEnabled(false);
  assert.equal(manager.isEnabled(), false);
  assert.equal(values.get("rolling-dice-chess:sound-enabled"), "false");
  manager.setEnabled(true);
  assert.equal(values.get("rolling-dice-chess:sound-enabled"), "true");

  const restored = new SoundManager({
    audioAdapter: { create: () => { throw new Error("Unexpected audio creation"); } },
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
  assert.equal(restored.isEnabled(), true);
  assert.doesNotThrow(() => restored.play("timeout"));

  console.log("Sound no-op checks passed: no Audio creation, toggle and preference preserved.");
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}
