type RenderSource = "caller" | "opponent";

let pendingRender: { readonly source: RenderSource; readonly startedAt: number } | null = null;
let moveStartedAt: number | null = null;
let realtimeObservedAt: number | null = null;

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function emit(stage: string, metadata: Readonly<Record<string, unknown>> = {}): void {
  console.info(JSON.stringify({ event: "multiplayer-latency", stage, ...metadata }));
}

export function markMoveConfirmation(): void {
  moveStartedAt = now();
  emit("T0-move-confirmed");
}

export function markRequestStarted(action: string): number {
  const startedAt = now();
  if (action === "move") emit("T1-request-started", { elapsedMs: moveStartedAt === null ? null : startedAt - moveStartedAt });
  return startedAt;
}

export function markResponseReceived(
  action: string,
  startedAt: number,
  serverTiming: string | null,
  correlationId: string | null,
): void {
  const receivedAt = now();
  if (action === "move") {
    emit("T4-caller-response-received", {
      correlationId,
      requestMs: receivedAt - startedAt,
      serverTiming,
    });
    pendingRender = { source: "caller", startedAt: moveStartedAt ?? startedAt };
  } else if (action === "heartbeat" && realtimeObservedAt !== null) {
    emit("T7-opponent-reconcile-completed", {
      correlationId,
      reconcileMs: receivedAt - realtimeObservedAt,
      serverTiming,
    });
    pendingRender = { source: "opponent", startedAt: realtimeObservedAt };
    realtimeObservedAt = null;
  }
}

export function markRealtimeObserved(): void {
  realtimeObservedAt = now();
  emit("T6-opponent-realtime-observed");
}

export function markCanonicalBoardRendered(): void {
  if (!pendingRender) return;
  const rendered = pendingRender;
  pendingRender = null;
  emit(rendered.source === "caller" ? "T5-caller-board-rendered" : "T8-opponent-board-rendered", {
    elapsedMs: now() - rendered.startedAt,
  });
}
