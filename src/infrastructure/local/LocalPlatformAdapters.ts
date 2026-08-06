import type { IdGenerator, RandomSource, Scheduler, TimeSource } from "../../domain/contracts/PlatformPorts";

export const javaScriptRandomSource: RandomSource = () => Math.random();
export const systemTimeSource: TimeSource = { now: () => Date.now() };
export const systemScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export const browserIdGenerator: IdGenerator = { nextId: () => crypto.randomUUID() };
