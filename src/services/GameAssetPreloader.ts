import { SLOT_MACHINE_ASSETS } from "../assets/slot-machine";
import { PIECE_SET_CATALOG } from "../config/pieceSets";
import type { PieceSet } from "../types/PieceSet";

const ASSET_LOAD_TIMEOUT_MS = 15_000;

export type AssetLoader = (url: string) => Promise<void>;

function loadBrowserImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to load critical game asset: ${url}`));
    image.src = url;
  });
}

function uniqueAssetUrls(urls: readonly string[]): string[] {
  return [...new Set(urls)];
}

export function getRequiredGameAssetUrls(pieceSet: PieceSet): string[] {
  const definition = PIECE_SET_CATALOG[pieceSet];
  const pieceUrls = [
    definition.boardAssets,
    definition.rouletteAssets,
    definition.resultAssets,
  ].flatMap((assets) => Object.values(assets).flatMap((colorAssets) => Object.values(colorAssets)));

  return uniqueAssetUrls([
    SLOT_MACHINE_ASSETS.gameAssembly.machine,
    SLOT_MACHINE_ASSETS.gameAssembly.lever,
    ...pieceUrls,
  ]);
}

export class GameAssetPreloader {
  private readonly loader: AssetLoader;

  private readonly promises = new Map<string, Promise<void>>();

  private readonly timeoutMs: number;

  public constructor(
    loader: AssetLoader = loadBrowserImage,
    timeoutMs: number = ASSET_LOAD_TIMEOUT_MS,
  ) {
    this.loader = loader;
    this.timeoutMs = timeoutMs;
  }

  public preload(urls: readonly string[]): Promise<void> {
    return Promise.all(uniqueAssetUrls(urls).map((url) => this.preloadOne(url))).then(() => undefined);
  }

  private preloadOne(url: string): Promise<void> {
    const existing = this.promises.get(url);
    if (existing) return existing;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Timed out loading critical game asset: ${url}`)),
        this.timeoutMs,
      );
    });

    const pending = Promise.race([this.loader(url), timeout])
      .finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      })
      .catch((error: unknown) => {
        this.promises.delete(url);
        throw error;
      });

    this.promises.set(url, pending);
    return pending;
  }
}

export const gameAssetPreloader = new GameAssetPreloader();
