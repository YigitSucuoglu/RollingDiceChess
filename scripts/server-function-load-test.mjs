import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const temporaryRoot = path.join(repositoryRoot, "node_modules", ".tmp");
mkdirSync(temporaryRoot, { recursive: true });
const outputDirectory = mkdtempSync(path.join(temporaryRoot, "server-function-load-"));
const compiler = path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");

try {
  assert.ok(existsSync(compiler), `TypeScript compiler is missing: ${compiler}`);
  const compilation = spawnSync(process.execPath, [
    compiler,
    "--project",
    path.join(repositoryRoot, "tsconfig.server-runtime.json"),
    "--outDir",
    outputDirectory,
    "--tsBuildInfoFile",
    path.join(outputDirectory, "tsconfig.tsbuildinfo"),
    "--pretty",
    "false",
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
  });

  assert.ifError(compilation.error);
  assert.equal(
    compilation.status,
    0,
    `Server function compilation failed.\n${compilation.stdout}${compilation.stderr}`,
  );

  const emittedEntry = path.join(outputDirectory, "api", "multiplayer.js");
  assert.ok(existsSync(emittedEntry), `Server function was not emitted: ${emittedEntry}`);
  const serverFunction = await import(pathToFileURL(emittedEntry).href);
  assert.equal(typeof serverFunction.default, "function");
  console.log("Server function ESM load passed: emitted api/multiplayer.js and trusted shared modules loaded.");
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
