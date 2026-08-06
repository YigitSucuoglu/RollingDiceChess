export interface TurnOrchestrationPolicy {
  readonly mode: "bot" | "online";
  readonly humanRollTrigger: "manual" | "automatic";
  readonly automatedTurnDelayMs: number;
  readonly rollAuthority: "local" | "server";
  readonly clockStart: "after-roll-resolved";
}

export const LOCAL_BOT_TURN_POLICY: TurnOrchestrationPolicy = {
  mode: "bot",
  humanRollTrigger: "manual",
  automatedTurnDelayMs: 500,
  rollAuthority: "local",
  clockStart: "after-roll-resolved",
};

/** Design contract only; ARCH-01 does not implement online behavior. */
export const FUTURE_ONLINE_TURN_POLICY: TurnOrchestrationPolicy = {
  mode: "online",
  humanRollTrigger: "automatic",
  automatedTurnDelayMs: 750,
  rollAuthority: "server",
  clockStart: "after-roll-resolved",
};
