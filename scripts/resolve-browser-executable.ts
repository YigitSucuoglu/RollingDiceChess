import { existsSync } from "node:fs";
import { join } from "node:path";

export interface BrowserExecutableResolution {
  executablePath: string | undefined;
  source: "explicit" | "system" | "playwright";
}

function firstExistingPath(paths: Array<string | undefined>): string | undefined {
  return paths.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
}

function localBrowserCandidates(): string[] {
  if (process.platform === "win32") {
    return [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
        : undefined,
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe")
        : undefined,
    ].filter((candidate): candidate is string => Boolean(candidate));
  }

  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }

  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
  ];
}

export function resolveBrowserExecutable(
  playwrightExecutablePath: string,
): BrowserExecutableResolution {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(
        `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH does not exist: ${explicitPath}\n` +
        "Set it to an installed Chrome/Edge executable or run: npx playwright install chromium",
      );
    }
    return { executablePath: explicitPath, source: "explicit" };
  }

  if (process.env.CI) {
    return { executablePath: undefined, source: "playwright" };
  }

  const systemPath = firstExistingPath(localBrowserCandidates());
  if (systemPath) {
    console.log(`Using system Chrome/Edge: ${systemPath}`);
    return { executablePath: systemPath, source: "system" };
  }

  if (existsSync(playwrightExecutablePath)) {
    return { executablePath: undefined, source: "playwright" };
  }

  throw new Error(
    "No usable Chromium browser was found. Either set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH " +
    "to an installed Chrome/Edge executable or run: npx playwright install chromium",
  );
}
