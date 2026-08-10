import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

import { startPreview, stopPreview, summarize, writeReports } from "./perf-utils.mjs";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const profiles = {
  normal: null,
  fast4gLike: { downloadThroughput: 1_500_000 / 8, latency: 100, uploadThroughput: 750_000 / 8 },
};

const server = await startPreview();
let browser;

try {
  await mkdir(".performance/release-01c", { recursive: true });
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  const report = { browser: await browser.version(), generatedAt: new Date().toISOString(), profiles: {} };

  for (const [profileName, network] of Object.entries(profiles)) {
    const samples = [];
    for (let run = 1; run <= 3; run += 1) {
      const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { height: 900, width: 1440 } });
      const page = await context.newPage();
      await page.addInitScript(() => { Math.random = () => 0; });
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      if (network) {
        await cdp.send("Network.emulateNetworkConditions", { ...network, connectionType: "cellular4g", offline: false });
      }

      await page.goto("http://127.0.0.1:4173/", { waitUntil: "load" });
      if (profileName === "normal" && run === 1) {
        await page.screenshot({ path: ".performance/release-01c/home-after.png", fullPage: true });
      }
      const resourceOffset = await page.evaluate(() => performance.getEntriesByType("resource").length);
      const playStart = performance.now();
      await page.getByRole("button", { name: /^play$|^oyna$/i }).click();
      await page.getByRole("heading", { level: 1 }).waitFor();
      const setupVisibleMs = performance.now() - playStart;

      const startGame = page.getByRole("button", { name: /start game|oyunu baÅŸlat/i });
      await startGame.scrollIntoViewIfNeeded();
      const gameStart = performance.now();
      await startGame.click();
      const loadingVisible = await page.getByRole("status").waitFor({ timeout: 250 })
        .then(() => true)
        .catch(() => false);
      const loadingVisibleMs = loadingVisible ? performance.now() - gameStart : 0;
      await page.locator(".board").waitFor();
      const gameReadyMs = performance.now() - gameStart;
      const firstGameReadyMs = performance.now() - playStart;
      const resources = await page.evaluate((offset) => performance.getEntriesByType("resource")
        .slice(offset)
        .map((entry) => entry.toJSON())
        .filter((entry) => /assets\/(?:game-|(?:white|black)-(?:bishop|king|knight|pawn|queen|rook)-).*\.webp/.test(entry.name))
        .filter((entry) => !/-(?:1x|2x|fallback)-/.test(entry.name))
        .map((entry) => ({ encodedBodySize: entry.encodedBodySize, name: entry.name, transferSize: entry.transferSize })), resourceOffset);

      if (profileName === "normal" && run === 1) {
        await page.screenshot({ path: ".performance/release-01c/game-gold-desktop-after.png", fullPage: true });
        await page.getByRole("button", { name: /^roll$|^zar at$/i }).click();
        await page.locator('[data-roll-phase="resolved"]').waitFor();
        await page.screenshot({ path: ".performance/release-01c/reel-gold-resolved-after.png", fullPage: true });
        await page.locator('[data-square="e2"]').click();
        await page.locator(".move-dot").first().waitFor();
        await page.screenshot({ path: ".performance/release-01c/game-gold-selected-after.png", fullPage: true });
      }

      samples.push({
        criticalEncodedBytes: resources.reduce((sum, resource) => sum + resource.encodedBodySize, 0),
        criticalRequests: resources.length,
        firstGameReadyMs,
        gameReadyMs,
        loadingVisibleMs,
        setupVisibleMs,
      });
      await context.close();
    }
    report.profiles[profileName] = {
      criticalEncodedBytes: summarize(samples.map((sample) => sample.criticalEncodedBytes)),
      criticalRequests: summarize(samples.map((sample) => sample.criticalRequests)),
      firstGameReadyMs: summarize(samples.map((sample) => sample.firstGameReadyMs)),
      gameReadyMs: summarize(samples.map((sample) => sample.gameReadyMs)),
      loadingVisibleMs: summarize(samples.map((sample) => sample.loadingVisibleMs)),
      setupVisibleMs: summarize(samples.map((sample) => sample.setupVisibleMs)),
      samples,
    };
  }

  const mobileContext = await browser.newContext({ deviceScaleFactor: 2, viewport: { height: 844, width: 390 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto("http://127.0.0.1:4173/play");
  await mobilePage.waitForLoadState("networkidle");
  await mobilePage.getByRole("button", { name: /start game|oyunu baÅŸlat/i }).scrollIntoViewIfNeeded();
  await mobilePage.getByRole("button", { name: /start game|oyunu baÅŸlat/i }).click();
  await mobilePage.locator(".board").waitFor();
  await mobilePage.screenshot({ path: ".performance/release-01c/game-gold-mobile-after.png", fullPage: true });
  await mobileContext.close();

  const normal = report.profiles.normal;
  const fast4g = report.profiles.fast4gLike;
  const markdown = `# First-game cold-load report\n\nBrowser: ${report.browser}\n\n| Profile | Critical bytes p50 | Requests | Home Play → Setup p50 | Start Game → loading p50 | Start Game → board p50 | Home Play → board p50 |\n|---|---:|---:|---:|---:|---:|---:|\n| Normal | ${normal.criticalEncodedBytes.p50} | ${normal.criticalRequests.p50} | ${normal.setupVisibleMs.p50.toFixed(1)} ms | ${normal.loadingVisibleMs.p50.toFixed(1)} ms | ${normal.gameReadyMs.p50.toFixed(1)} ms | ${normal.firstGameReadyMs.p50.toFixed(1)} ms |\n| Fast 4G-like | ${fast4g.criticalEncodedBytes.p50} | ${fast4g.criticalRequests.p50} | ${fast4g.setupVisibleMs.p50.toFixed(1)} ms | ${fast4g.loadingVisibleMs.p50.toFixed(1)} ms | ${fast4g.gameReadyMs.p50.toFixed(1)} ms | ${fast4g.firstGameReadyMs.p50.toFixed(1)} ms |\n`;
  await writeReports("release-01c", "cold-load-after", report, markdown);
  console.log(markdown);
} finally {
  await browser?.close();
  stopPreview(server);
}
