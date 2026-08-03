import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { startPreview, stopPreview, writeReports } from "./perf-utils.mjs";

const server = await startPreview();
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
let chrome;
try {
  chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
  const profiles = [
    { name: "desktop", formFactor: "desktop", screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false } },
    { name: "mobile", formFactor: "mobile", screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false } },
  ];
  const results = [];
  for (const profile of profiles) {
    const run = await lighthouse("http://127.0.0.1:4173/", { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance"], formFactor: profile.formFactor, screenEmulation: profile.screenEmulation });
    if (!run) throw new Error(`Lighthouse returned no result for ${profile.name}`);
    const audits = run.lhr.audits;
    results.push({ profile: profile.name, score: (run.lhr.categories.performance.score ?? 0) * 100, fcpMs: audits["first-contentful-paint"].numericValue, lcpMs: audits["largest-contentful-paint"].numericValue, tbtMs: audits["total-blocking-time"].numericValue, cls: audits["cumulative-layout-shift"].numericValue, speedIndexMs: audits["speed-index"].numericValue, transferBytes: audits["total-byte-weight"].numericValue });
    await writeReports("lighthouse", `home-${profile.name}-raw`, run.lhr, `# Raw Lighthouse ${profile.name}\n\nSee JSON report.\n`);
  }
  const report = { generatedAt: new Date().toISOString(), chrome: chromePath ?? "auto", runsPerProfile: 1, route: "/", results };
  const markdown = `# Lighthouse baseline\n\nSingle-run baseline; compare trends, not absolute truth.\n\n| Profile | Score | FCP | LCP | TBT | CLS | Speed Index | Transfer |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${results.map((r) => `| ${r.profile} | ${r.score.toFixed(0)} | ${r.fcpMs.toFixed(0)} ms | ${r.lcpMs.toFixed(0)} ms | ${r.tbtMs.toFixed(0)} ms | ${r.cls.toFixed(3)} | ${r.speedIndexMs.toFixed(0)} ms | ${(r.transferBytes / 1024).toFixed(0)} KiB |`).join("\n")}\n`;
  await writeReports("lighthouse", "lighthouse-summary", report, markdown);
  console.log(markdown);
} finally { await chrome?.kill(); stopPreview(server); }
