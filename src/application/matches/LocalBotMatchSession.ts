import type Game from "../../engine/Game";
import type { MatchXpProgressionResult } from "../../profile/ProfileProgression";
import type {
  LocalBotMatchConfiguration,
  MatchAction,
  MatchActionResult,
  MatchListener,
  MatchActionRejectionReason,
  MatchSession,
  MatchSnapshot,
} from "../../domain/contracts/MatchContracts";
import type { Scheduler } from "../../domain/contracts/PlatformPorts";
import { ROLL_TIMING } from "../../config/rollTiming";

const INITIAL_VISIBLE_ROLL = ["pawn", "knight", "bishop"] as const;
const BOT_START_DELAY_MS = 500;
const UNPLAYABLE_ROLL_REVIEW_MS = 1_200;
const TURN_SKIPPED_MESSAGE_MS = 1_000;
const CLOCK_REFRESH_INTERVAL_MS = 250;
const LOW_TIME_CLOCK_REFRESH_INTERVAL_MS = 75;
const LOW_TIME_THRESHOLD_MS = 15_000;

interface LocalBotMatchSessionDependencies {
  readonly scheduler: Scheduler;
  readonly rollDurationMs?: number;
  readonly botStartDelayMs?: number;
}

export default class LocalBotMatchSession implements MatchSession {
  public readonly game: Game;

  public readonly configuration: LocalBotMatchConfiguration;

  private readonly listeners = new Set<MatchListener>();

  private readonly getXpProgression: () => MatchXpProgressionResult | null;

  private readonly unsubscribeGame: () => void;

  private disposed = false;

  private rollPhase: "ready" | "spinning" | "resolved" = "ready";

  private visibleRoll: Game["currentRoll"] = INITIAL_VISIBLE_ROLL;

  private rollSequence = 0;

  private rollTrigger: "manual" | "automatic" | null = null;

  private observedRoll: Game["currentRoll"];

  private rollTimeout: unknown | null = null;

  private readonly scheduler: Scheduler;

  private readonly rollDurationMs: number;

  private readonly botStartDelayMs: number;

  private botStartTimeout: unknown | null = null;

  private botAbortController: AbortController | null = null;

  private botLifecycleGeneration = 0;

  private skipPhase: "none" | "reviewing" | "message" = "none";

  private skipSequence = 0;

  private skipTimeout: unknown | null = null;

  private clockRefreshTimeout: unknown | null = null;

  public constructor(
    game: Game,
    configuration: LocalBotMatchConfiguration,
    getXpProgression: () => MatchXpProgressionResult | null = () => null,
    dependencies: LocalBotMatchSessionDependencies,
  ) {
    this.game = game;
    this.configuration = configuration;
    this.getXpProgression = getXpProgression;
    this.scheduler = dependencies.scheduler;
    this.rollDurationMs = dependencies.rollDurationMs ?? ROLL_TIMING.durationMs;
    this.botStartDelayMs = dependencies.botStartDelayMs ?? BOT_START_DELAY_MS;
    this.observedRoll = game.currentRoll;
    this.unsubscribeGame = game.subscribe(() => this.handleGameNotification());
    this.ensureBotLifecycle();
  }

  public getSnapshot(): MatchSnapshot {
    this.synchronizeRollTurn();
    const history = this.game.moveHistory.getSnapshot();
    const hasPlayableMoves = this.game.hasPlayableMoves();
    const isHumanTurn = this.game.currentTurn === this.configuration.playerColor;
    const canAct = !this.disposed && !this.game.winner && isHumanTurn &&
      hasPlayableMoves && this.skipPhase === "none" && this.rollPhase === "resolved";

    return {
      schemaVersion: 1,
      mode: "bot",
      authority: "local",
      connection: "local",
      lifecycle: this.game.winner ? "completed" : "active",
      currentPlayer: this.game.currentTurn,
      controller: isHumanTurn ? "human" : "bot",
      board: this.game.board.squares.map((row) => row.map((piece) => piece
        ? { ...piece, initialPosition: { ...piece.initialPosition } }
        : null)),
      currentRoll: [...this.game.currentRoll],
      roll: {
        phase: this.rollPhase,
        visibleRoll: [...this.visibleRoll],
        sequence: this.rollSequence,
        trigger: this.rollTrigger,
        canStartManualRoll: this.canStartManualRoll(),
      },
      skip: { phase: this.skipPhase, sequence: this.skipSequence },
      capabilities: {
        canSelect: canAct,
        canMove: canAct,
        canStartManualRoll: this.canStartManualRoll(),
      },
      hasPlayableMoves,
      remainingRights: this.game.turnRights.getSnapshot(),
      selectableMoves: this.game.possibleMoves.map((move) => ({
        ...move,
        from: { ...move.from },
        to: { ...move.to },
      })),
      selectedSquare: this.game.selectedSquare ? { ...this.game.selectedSquare } : null,
      clock: this.game.clock.getSnapshot(),
      winner: this.game.winner,
      resultReason: this.game.resultReason,
      moveHistory: history,
    };
  }

  public subscribe(listener: MatchListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async requestAction(action: MatchAction): Promise<MatchActionResult> {
    if (this.disposed) return this.reject("session-disposed");

    if (action.schemaVersion !== 1) return this.reject("invalid-action");

    if (action.type === "START_MANUAL_ROLL") {
      return this.startManualRoll();
    }

    if (this.game.winner) return this.reject("invalid-action");

    if (
      (action.type === "SELECT_SQUARE" ||
        action.type === "CLEAR_SELECTION" ||
        action.type === "MAKE_MOVE") &&
      this.game.currentTurn !== this.configuration.playerColor
    ) {
      return this.reject("not-active-player");
    }

    let accepted = false;
    switch (action.type) {
      case "SELECT_SQUARE": {
        if (!this.isPosition(action.position)) return this.reject("invalid-action");
        const previousSelection = this.game.selectedSquare;
        this.game.selectSquare(action.position.row, action.position.col);
        accepted = !this.positionsMatch(previousSelection, this.game.selectedSquare);
        break;
      }
      case "CLEAR_SELECTION":
        accepted = this.game.clearSelection();
        break;
      case "MAKE_MOVE": {
        if (
          typeof action.pieceId !== "string" || action.pieceId.length === 0 ||
          !this.isPosition(action.from) || !this.isPosition(action.to)
        ) {
          return this.reject("invalid-action");
        }
        const approvedMove = this.game.possibleMoves.find((move) =>
          move.pieceId === action.pieceId &&
          this.positionsMatch(move.from, action.from) &&
          this.positionsMatch(move.to, action.to));
        if (!approvedMove) return this.reject("illegal-move");
        this.game.makeMove(approvedMove);
        accepted = this.game.lastMove === approvedMove;
        break;
      }
    }

    if (!accepted) return this.reject("invalid-action");
    const snapshot = this.getSnapshot();
    this.publish(snapshot);
    this.ensureBotLifecycle();
    return { accepted: true, snapshot };
  }

  public getMatchXpProgression(): MatchXpProgressionResult | null {
    return this.getXpProgression();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearRollTimeout();
    this.clearBotStartTimeout();
    this.clearSkipTimeout();
    this.clearClockRefreshTimeout();
    this.botLifecycleGeneration++;
    this.botAbortController?.abort();
    this.botAbortController = null;
    this.unsubscribeGame();
    this.listeners.clear();
    this.game.dispose();
  }

  private publish(snapshot: MatchSnapshot = this.getSnapshot()): void {
    if (this.disposed) return;
    for (const listener of this.listeners) listener(snapshot);
  }

  private reject(reason: MatchActionRejectionReason): MatchActionResult {
    return { accepted: false, reason, snapshot: this.getSnapshot() };
  }

  private startManualRoll(): MatchActionResult {
    this.synchronizeRollTurn();
    if (this.game.winner) return this.reject("game-over");
    if (this.game.currentTurn !== this.configuration.playerColor) {
      return this.reject("not-human-turn");
    }
    if (this.rollPhase === "spinning") return this.reject("roll-in-progress");
    if (this.rollPhase !== "ready") return this.reject("roll-not-allowed");
    return this.beginRoll("manual");
  }

  private beginRoll(trigger: "manual" | "automatic"): MatchActionResult {
    this.rollPhase = "spinning";
    this.visibleRoll = [...this.game.currentRoll];
    this.rollTrigger = trigger;
    this.rollSequence++;
    const snapshot = this.getSnapshot();
    const turnRoll = this.observedRoll;
    this.rollTimeout = this.scheduler.setTimeout(() => {
      this.rollTimeout = null;
      if (this.disposed || this.game.winner || this.game.currentRoll !== turnRoll) return;
      this.rollPhase = "resolved";
      this.game.startClockForCurrentTurn();
      this.publish();
      this.synchronizeClockRefresh();
      this.ensureSkipLifecycle();
      if (this.game.isBotTurn() && this.game.hasPlayableMoves()) {
        this.runBotTurn(this.botLifecycleGeneration);
      }
    }, this.rollDurationMs);
    this.publish(snapshot);
    return { accepted: true, snapshot };
  }

  private canStartManualRoll(): boolean {
    return !this.disposed && !this.game.winner &&
      this.game.currentTurn === this.configuration.playerColor &&
      this.rollPhase === "ready";
  }

  private synchronizeRollTurn(): void {
    if (this.observedRoll === this.game.currentRoll) return;
    this.clearRollTimeout();
    this.observedRoll = this.game.currentRoll;
    this.rollPhase = "ready";
    this.rollTrigger = null;
    this.skipPhase = "none";
    this.clearSkipTimeout();
  }

  private clearRollTimeout(): void {
    if (this.rollTimeout === null) return;
    this.scheduler.clearTimeout(this.rollTimeout);
    this.rollTimeout = null;
  }

  private ensureBotLifecycle(): void {
    this.synchronizeRollTurn();
    if (
      this.disposed || this.game.winner || !this.game.isBotTurn() ||
      this.rollPhase !== "ready" || this.botStartTimeout !== null ||
      this.botAbortController !== null
    ) return;

    const generation = ++this.botLifecycleGeneration;
    this.botStartTimeout = this.scheduler.setTimeout(() => {
      this.botStartTimeout = null;
      if (!this.isCurrentBotLifecycle(generation) || this.rollPhase !== "ready") return;
      this.beginRoll("automatic");
    }, this.botStartDelayMs);
  }

  private runBotTurn(generation: number): void {
    if (!this.isCurrentBotLifecycle(generation) || this.botAbortController) return;
    const abortController = new AbortController();
    this.botAbortController = abortController;
    void this.game.playBotTurn(
      () => {
        if (this.isCurrentGeneration(generation) && !abortController.signal.aborted) {
          this.publish();
          this.synchronizeClockRefresh();
          this.ensureSkipLifecycle();
        }
      },
      abortController.signal,
    ).finally(() => {
      if (this.botAbortController === abortController) this.botAbortController = null;
      if (!this.isCurrentBotLifecycle(generation)) return;
      this.ensureBotLifecycle();
    });
  }

  private isCurrentBotLifecycle(generation: number): boolean {
    return this.isCurrentGeneration(generation) && !this.game.winner && this.game.isBotTurn();
  }

  private isCurrentGeneration(generation: number): boolean {
    return !this.disposed && generation === this.botLifecycleGeneration;
  }

  private clearBotStartTimeout(): void {
    if (this.botStartTimeout === null) return;
    this.scheduler.clearTimeout(this.botStartTimeout);
    this.botStartTimeout = null;
  }

  private ensureSkipLifecycle(): void {
    if (
      this.disposed || this.game.winner || this.rollPhase !== "resolved" ||
      this.game.hasPlayableMoves() || this.skipPhase !== "none" || this.skipTimeout !== null
    ) return;

    const turnRoll = this.game.currentRoll;
    this.skipPhase = "reviewing";
    this.publish();
    this.skipTimeout = this.scheduler.setTimeout(() => {
      this.skipTimeout = null;
      if (!this.isSameActiveRoll(turnRoll)) return;
      this.skipPhase = "message";
      this.skipSequence++;
      this.publish();
      this.skipTimeout = this.scheduler.setTimeout(() => {
        this.skipTimeout = null;
        if (!this.isSameActiveRoll(turnRoll)) return;
        if (!this.game.skipUnplayableTurn()) return;
        this.skipPhase = "none";
        this.synchronizeRollTurn();
        this.publish();
        this.ensureBotLifecycle();
      }, TURN_SKIPPED_MESSAGE_MS);
    }, UNPLAYABLE_ROLL_REVIEW_MS);
  }

  private isSameActiveRoll(turnRoll: Game["currentRoll"]): boolean {
    return !this.disposed && !this.game.winner && this.game.currentRoll === turnRoll;
  }

  private clearSkipTimeout(): void {
    if (this.skipTimeout === null) return;
    this.scheduler.clearTimeout(this.skipTimeout);
    this.skipTimeout = null;
  }

  private synchronizeClockRefresh(): void {
    if (this.disposed || this.game.winner) {
      this.clearClockRefreshTimeout();
      return;
    }
    const clock = this.game.clock.getSnapshot();
    if (!clock.isRunning || this.clockRefreshTimeout !== null) return;
    const activeRemainingMs = clock.activeColor === "white"
      ? clock.whiteRemainingMs
      : clock.activeColor === "black" ? clock.blackRemainingMs : null;
    const delayMs = activeRemainingMs !== null && activeRemainingMs <= LOW_TIME_THRESHOLD_MS
      ? LOW_TIME_CLOCK_REFRESH_INTERVAL_MS
      : CLOCK_REFRESH_INTERVAL_MS;
    this.clockRefreshTimeout = this.scheduler.setTimeout(() => {
      this.clockRefreshTimeout = null;
      if (this.disposed) return;
      this.publish();
      this.synchronizeClockRefresh();
    }, delayMs);
  }

  private clearClockRefreshTimeout(): void {
    if (this.clockRefreshTimeout === null) return;
    this.scheduler.clearTimeout(this.clockRefreshTimeout);
    this.clockRefreshTimeout = null;
  }

  private handleGameNotification(): void {
    if (this.game.winner) {
      this.clearRollTimeout();
      this.clearBotStartTimeout();
      this.clearSkipTimeout();
      this.clearClockRefreshTimeout();
      this.botLifecycleGeneration++;
      this.botAbortController?.abort();
      this.botAbortController = null;
    }
    this.publish();
  }

  private isPosition(value: Readonly<{ row: number; col: number }>): boolean {
    return Number.isInteger(value.row) && Number.isInteger(value.col) &&
      value.row >= 0 && value.row < 8 && value.col >= 0 && value.col < 8;
  }

  private positionsMatch(
    first: Readonly<{ row: number; col: number }> | null,
    second: Readonly<{ row: number; col: number }> | null,
  ): boolean {
    return first?.row === second?.row && first?.col === second?.col;
  }
}
