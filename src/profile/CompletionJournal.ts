import type { PlayerProfile } from "./PlayerProfile";
import type { ProgressionOperation } from "./PlayerSync";

export const COMPLETION_JOURNAL_KEY = "roulettechess.completion-journal.v1";

export interface CompletionEntry {
  readonly schemaVersion: 1;
  readonly matchId: string;
  readonly ownerPlayerId: string;
  readonly operation: ProgressionOperation;
  readonly result: { readonly won: boolean; readonly terminationReason: "king-captured" | "timeout"; readonly xpAwarded: number };
  readonly profile: PlayerProfile;
  readonly acknowledged: boolean;
}

export interface CompletionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class CompletionJournal {
  private readonly storage: CompletionStorage;

  constructor(storage: CompletionStorage) {
    this.storage = storage;
  }

  public read(): CompletionEntry[] {
    const raw = this.storage.getItem(COMPLETION_JOURNAL_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((entry): entry is CompletionEntry =>
      typeof entry === "object" && entry !== null && entry.schemaVersion === 1
      && typeof entry.matchId === "string" && typeof entry.ownerPlayerId === "string"
      && typeof entry.acknowledged === "boolean" && typeof entry.operation?.operationId === "string"
      && typeof entry.result?.won === "boolean"
      && (entry.result?.terminationReason === "king-captured" || entry.result?.terminationReason === "timeout")
      && typeof entry.result?.xpAwarded === "number"
      && typeof entry.operation?.payload === "object" && entry.operation.payload !== null
      && typeof entry.operation.payload.singleMatch === "object"
      && entry.operation.payload.singleMatch !== null
      && entry.operation.payload.singleMatch.schemaVersion === 1
      && entry.operation.payload.singleMatch.matchId === entry.matchId
      && entry.operation.payload.singleMatch.snapshot?.matchId === entry.matchId
      && entry.operation.payload.singleMatch.snapshot?.playerId === entry.ownerPlayerId
      && typeof entry.profile?.playerId === "string"
      && Array.isArray(entry.profile?.processedMatchIds)
      && entry.profile.playerId === entry.ownerPlayerId
      && entry.profile.processedMatchIds.includes(entry.matchId))) {
      throw new Error("Completion journal is invalid; recovery cannot continue safely.");
    }
    return parsed;
  }

  public append(entry: CompletionEntry): CompletionEntry {
    const entries = this.read();
    const existing = entries.find((item) => item.matchId === entry.matchId);
    if (existing) {
      if (existing.ownerPlayerId !== entry.ownerPlayerId
          || JSON.stringify(existing.profile) !== JSON.stringify(entry.profile)
          || JSON.stringify(existing.result) !== JSON.stringify(entry.result)
          || JSON.stringify(existing.operation.payload) !== JSON.stringify(entry.operation.payload)) {
        throw new Error("Completion journal conflicts with an existing match.");
      }
      return existing;
    }
    this.write([...entries, entry]);
    return entry;
  }

  public acknowledge(operationId: string, ownerPlayerId: string): void {
    const entries = this.read();
    const target = entries.find((entry) => entry.ownerPlayerId === ownerPlayerId
      && entry.operation.operationId === operationId);
    if (target && !target.acknowledged) {
      this.write(entries.map((entry) => entry === target ? { ...entry, acknowledged: true } : entry));
    }
  }

  public pruneAcknowledged(ownerPlayerId: string): void {
    const entries = this.read();
    const remaining = entries.filter((entry) =>
      entry.ownerPlayerId !== ownerPlayerId || !entry.acknowledged);
    if (remaining.length !== entries.length) this.write(remaining);
  }

  private write(entries: CompletionEntry[]): void {
    this.storage.setItem(COMPLETION_JOURNAL_KEY, JSON.stringify(entries));
  }
}
