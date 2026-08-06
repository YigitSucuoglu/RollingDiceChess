export type RandomSource = () => number;

export interface TimeSource {
  now(): number;
}

export interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface IdGenerator {
  nextId(): string;
}
