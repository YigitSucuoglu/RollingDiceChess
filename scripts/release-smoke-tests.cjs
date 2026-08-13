const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, "dist");
const indexPath = path.join(distRoot, "index.html");
const vercelConfigPath = path.join(projectRoot, "vercel.json");
const projectStatusPath = path.join(projectRoot, "PROJECT_STATUS.md");

assert.ok(fs.existsSync(distRoot), "dist/ does not exist; run the production build first");
assert.ok(fs.statSync(distRoot).isDirectory(), "dist is not a directory");
assert.ok(fs.existsSync(indexPath), "dist/index.html is missing");
assert.ok(fs.existsSync(vercelConfigPath), "vercel.json is missing");
assert.ok(fs.existsSync(projectStatusPath), "PROJECT_STATUS.md is missing");

const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
assert.equal(vercelConfig.framework, "vite", "Vercel framework must be Vite");
assert.equal(vercelConfig.installCommand, "npm ci", "Vercel install command must use the lock file");
assert.equal(vercelConfig.buildCommand, "npm run build", "Unexpected Vercel build command");
assert.equal(vercelConfig.outputDirectory, "dist", "Vercel output directory must be dist");
assert.ok(vercelConfig.rewrites?.some((rewrite) => rewrite.destination === "/index.html"), "SPA rewrite is missing");
const assetHeaders = vercelConfig.headers?.find((entry) => entry.source === "/assets/(.*)")?.headers ?? [];
assert.ok(assetHeaders.some((header) => header.key === "Cache-Control" && /immutable/.test(header.value)), "Immutable hashed-asset cache header is missing");
assert.equal(
  vercelConfig.headers?.some((entry) => entry.source === "/(.*)" && entry.headers?.some((header) => header.key === "Cache-Control" && /immutable/.test(header.value))) ?? false,
  false,
  "HTML/root routes must not receive an immutable cache header",
);

const indexHtml = fs.readFileSync(indexPath, "utf8");
assert.ok(indexHtml.trim().length > 0, "dist/index.html is empty");

const references = [...indexHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:https?:|data:|#)/.test(reference));
const scriptReferences = references.filter((reference) => /\.js(?:\?|$)/.test(reference));
const cssReferences = references.filter((reference) => /\.css(?:\?|$)/.test(reference));

assert.ok(scriptReferences.length > 0, "index.html does not reference a JavaScript bundle");

function resolveDistReference(reference) {
  const cleanReference = reference.split(/[?#]/, 1)[0].replace(/^\//, "");
  return path.join(distRoot, ...cleanReference.split("/"));
}

for (const reference of [...scriptReferences, ...cssReferences]) {
  assert.ok(fs.existsSync(resolveDistReference(reference)), `Missing referenced build file: ${reference}`);
}

const faviconReference = references.find((reference) => /favicon\.(?:svg|png|ico)(?:\?|$)/i.test(reference));
assert.ok(faviconReference, "No favicon reference found in dist/index.html");
assert.ok(fs.existsSync(resolveDistReference(faviconReference)), `Missing favicon output: ${faviconReference}`);

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
}

const buildFiles = walkFiles(distRoot);
const relativeBuildFiles = buildFiles.map((file) => path.relative(distRoot, file).replaceAll("\\", "/"));
assert.equal(relativeBuildFiles.some((file) => file.toLowerCase().endsWith(".wav")), false, "Removed WAV assets entered the build");
assert.equal(relativeBuildFiles.some((file) => file.toLowerCase().endsWith(".map")), false, "Public source maps entered the build");
assert.equal(relativeBuildFiles.some((file) => file.includes(".artifacts") || /(?:screenshot|comparison)/i.test(file)), false, "Cleanup artifacts entered the build");

const requiredSlotPrefixes = [
  "game-machine-",
  "game-lever-",
  "machine-1x-",
  "machine-2x-",
  "machine-mobile-",
  "machine-fallback-",
];
for (const prefix of requiredSlotPrefixes) {
  assert.ok(relativeBuildFiles.some((file) => path.basename(file).startsWith(prefix)), `Missing active slot asset: ${prefix}*`);
}

for (const retiredHomeMaster of [
  "update-machine-transparent-",
  "update-lever-transparent-",
  "update-machine-game-trimmed-",
  "update-lever-game-trimmed-",
]) {
  assert.equal(
    relativeBuildFiles.some((file) => path.basename(file).startsWith(retiredHomeMaster)),
    false,
    `Home master asset entered production: ${retiredHomeMaster}*`
  );
}

assert.equal(
  buildFiles.some((file) =>
    /(?:white|black)-(?:bishop|king|knight|pawn|queen|rook)-[^/\\]+\.png$/i.test(file) &&
    fs.statSync(file).size > 350_000
  ),
  false,
  "Oversized Gold source PNG entered production",
);

const colors = ["white", "black"];
const pieces = ["bishop", "king", "knight", "pawn", "queen", "rook"];
for (const color of colors) {
  for (const piece of pieces) {
    const prefix = `${color}-${piece}-`;
    assert.ok(relativeBuildFiles.some((file) => path.basename(file).startsWith(prefix)), `Missing Gold Piece Set asset: ${prefix}*`);
  }
}

const jsContents = buildFiles
  .filter((file) => path.extname(file).toLowerCase() === ".js")
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
const inlineSvgCount = (jsContents.match(/data:image\/svg\+xml/g) ?? []).length;
assert.ok(inlineSvgCount >= 24, `Expected embedded Classic/Retro SVG assets; found ${inlineSvgCount}`);
const projectStatus = fs.readFileSync(projectStatusPath, "utf8");
const appVersion = projectStatus.match(/## Current Version\s+v([^\s]+)/)?.[1];
assert.ok(appVersion, "Unable to read application version from PROJECT_STATUS.md");
assert.ok(jsContents.includes(`roulettechess@${appVersion}`), `Build release metadata does not contain v${appVersion}`);
assert.equal(/OBS-01B live verification/.test(jsContents), false, "Observability verification route entered the normal production build");
assert.equal(relativeBuildFiles.some((file) => /ObservabilityVerification/i.test(file)), false, "Observability verification chunk entered production");

const inspectableExtensions = new Set([".html", ".js", ".css", ".svg", ".json", ".map"]);
for (const file of buildFiles.filter((candidate) => inspectableExtensions.has(path.extname(candidate).toLowerCase()))) {
  const contents = fs.readFileSync(file, "utf8");
  // Require a directory segment and a second separator so regex source such as
  // Sentry's `/Id:\d+/` is not mistaken for an absolute Windows filesystem path.
  // Ignore escaped template text such as `t:\\n${value}\\` while retaining
  // the broad absolute-path scan for real drive-rooted build leaks.
  assert.equal(/[A-Za-z]:\\(?!n\$\{)[^\\/\r\n]{1,128}\\/.test(contents), false, `Absolute Windows path found in ${path.relative(distRoot, file)}`);
  assert.equal(/(?:^|["'(\s])[A-Za-z]:\//m.test(contents), false, `Forward-slash Windows path found in ${path.relative(distRoot, file)}`);
  assert.equal(/(?:C|D):\/Users\//i.test(contents), false, `Development user path found in ${path.relative(distRoot, file)}`);
}

console.log(`Release smoke checks passed: ${buildFiles.length} files, ${scriptReferences.length} JS, ${cssReferences.length} CSS, ${inlineSvgCount} embedded Piece Set SVGs.`);
