import { describe, expect, it, vi } from "vitest";

import {
  GameAssetPreloader,
  getRequiredGameAssetUrls,
} from "../../src/services/GameAssetPreloader";

describe("GameAssetPreloader", () => {
  it("returns only the machine, lever and selected Piece Set assets", () => {
    const urls = getRequiredGameAssetUrls("gold");

    expect(urls).toHaveLength(14);
    expect(new Set(urls)).toHaveLength(14);
    expect(urls.every((url) => url.endsWith(".webp"))).toBe(true);
    expect(urls.some((url) => url.includes("game-machine"))).toBe(true);
  });

  it("deduplicates repeated URLs and reuses cached success", async () => {
    const loader = vi.fn(async () => undefined);
    const preloader = new GameAssetPreloader(loader, 1_000);

    await preloader.preload(["machine.png", "machine.png", "lever.png"]);
    await preloader.preload(["machine.png"]);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenCalledWith("machine.png");
    expect(loader).toHaveBeenCalledWith("lever.png");
  });

  it("shares one pending load between concurrent requests", async () => {
    let resolveLoad: (() => void) | undefined;
    const loader = vi.fn(() => new Promise<void>((resolve) => { resolveLoad = resolve; }));
    const preloader = new GameAssetPreloader(loader, 1_000);

    const first = preloader.preload(["piece.png"]);
    const second = preloader.preload(["piece.png"]);
    resolveLoad?.();

    await Promise.all([first, second]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("rejects failures and permits a later retry", async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce(undefined);
    const preloader = new GameAssetPreloader(loader, 1_000);

    await expect(preloader.preload(["piece.png"])).rejects.toThrow("network failure");
    await expect(preloader.preload(["piece.png"])).resolves.toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("times out instead of hanging", async () => {
    vi.useFakeTimers();
    const preloader = new GameAssetPreloader(() => new Promise<void>(() => undefined), 50);
    const pending = preloader.preload(["stalled.png"]);
    const rejection = expect(pending).rejects.toThrow("Timed out loading critical game asset");

    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    vi.useRealTimers();
  });
});
