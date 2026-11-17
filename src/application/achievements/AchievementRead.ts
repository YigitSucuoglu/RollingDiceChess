import { ACHIEVEMENT_CATALOG_VERSION, type AchievementId } from "../../domain/achievements/AchievementContracts";
import { ACHIEVEMENT_DEFINITIONS } from "../../domain/achievements/AchievementCatalog";

export interface AchievementUnlock {
  readonly achievementId: AchievementId;
  readonly unlockedAt: string;
}

export interface AchievementCollection {
  readonly catalogVersion: typeof ACHIEVEMENT_CATALOG_VERSION;
  readonly unlockedCount: number;
  readonly unlocks: readonly AchievementUnlock[];
}

export type AchievementReadState =
  | { readonly status: "idle" | "loading" | "local-only" }
  | { readonly status: "empty" }
  | { readonly status: "success"; readonly collection: AchievementCollection }
  | { readonly status: "error"; readonly reason: "unavailable" | "catalog-mismatch" | "invalid-response" };

export interface AchievementReadPort {
  fetchCurrent(): Promise<AchievementCollection>;
}

export class AchievementReadError extends Error {
  public readonly reason: "unavailable" | "catalog-mismatch" | "invalid-response";
  public constructor(reason: "unavailable" | "catalog-mismatch" | "invalid-response") {
    super(reason);
    this.name = "AchievementReadError";
    this.reason = reason;
  }
}

export function parseAchievementCollection(value: unknown): AchievementCollection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AchievementReadError("invalid-response");
  const row = value as Record<string, unknown>;
  if (row.catalogVersion !== ACHIEVEMENT_CATALOG_VERSION) throw new AchievementReadError("catalog-mismatch");
  if (!Number.isSafeInteger(row.unlockedCount) || (row.unlockedCount as number) < 0 || !Array.isArray(row.unlocks)) {
    throw new AchievementReadError("invalid-response");
  }
  const seen = new Set<string>();
  const unlocks: AchievementUnlock[] = [];
  for (const item of row.unlocks) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new AchievementReadError("invalid-response");
    const unlock = item as Record<string, unknown>;
    if (typeof unlock.achievementId !== "string" || !(unlock.achievementId in ACHIEVEMENT_DEFINITIONS)
        || typeof unlock.unlockedAt !== "string" || !/^\d{4}-\d\d-\d\dT/.test(unlock.unlockedAt)
        || Number.isNaN(Date.parse(unlock.unlockedAt)) || seen.has(unlock.achievementId)) {
      throw new AchievementReadError("invalid-response");
    }
    seen.add(unlock.achievementId);
    unlocks.push({ achievementId: unlock.achievementId as AchievementId, unlockedAt: unlock.unlockedAt });
  }
  if (row.unlockedCount !== unlocks.length) throw new AchievementReadError("invalid-response");
  return { catalogVersion: ACHIEVEMENT_CATALOG_VERSION, unlockedCount: unlocks.length, unlocks };
}

export class AchievementReadService {
  private readonly port: AchievementReadPort;
  private state: AchievementReadState = { status: "idle" };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private owner: string | null = null;
  private pending?: Promise<void>;

  public constructor(port: AchievementReadPort) { this.port = port; }
  public getState(): AchievementReadState { return this.state; }
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  public setOwner(owner: string | null, localOnly = false): void {
    if (this.owner === owner && !localOnly) return;
    this.owner = owner;
    this.generation += 1;
    this.pending = undefined;
    this.publish({ status: localOnly ? "local-only" : "idle" });
  }
  public load(): Promise<void> {
    if (!this.owner) return Promise.resolve();
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    const owner = this.owner;
    this.publish({ status: "loading" });
    const request = this.port.fetchCurrent().then((collection) => {
      if (generation !== this.generation || owner !== this.owner) return;
      this.publish(collection.unlockedCount === 0 ? { status: "empty" } : { status: "success", collection });
    }).catch((error: unknown) => {
      if (generation !== this.generation || owner !== this.owner) return;
      this.publish({ status: "error", reason: error instanceof AchievementReadError ? error.reason : "unavailable" });
    }).finally(() => {
      if (this.pending === request) this.pending = undefined;
    });
    this.pending = request;
    return request;
  }
  public retry(): Promise<void> { return this.load(); }
  private publish(state: AchievementReadState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
