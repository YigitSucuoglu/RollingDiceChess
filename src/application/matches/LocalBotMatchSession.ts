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

interface LocalBotMatchSessionDependencies {
  readonly scheduler: Scheduler;
  readonly rollDurationMs?: number;
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
    this.observedRoll = game.currentRoll;
    this.unsubscribeGame = game.subscribe(() => this.publish());
  }

  public getSnapshot(): MatchSnapshot {
    this.synchronizeRollTurn();
    const history = this.game.moveHistory.getSnapshot();

    return {
      schemaVersion: 1,
      mode: "bot",
      authority: "local",
      connection: "local",
      lifecycle: this.game.winner ? "completed" : "active",
      currentPlayer: this.game.currentTurn,
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
      case "SKIP_UNPLAYABLE_TURN":
        accepted = this.game.skipUnplayableTurn();
        break;
      case "START_CLOCK":
        accepted = this.game.startClockForCurrentTurn();
        break;
    }

    if (!accepted) return this.reject("invalid-action");
    const snapshot = this.getSnapshot();
    this.publish(snapshot);
    return { accepted: true, snapshot };
  }

  public getMatchXpProgression(): MatchXpProgressionResult | null {
    return this.getXpProgression();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearRollTimeout();
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

  public startAutomaticRollReveal(): MatchActionResult {
    if (this.disposed) return this.reject("session-disposed");
    this.synchronizeRollTurn();
    if (this.game.winner) return this.reject("game-over");
    if (!this.game.isBotTurn() || this.rollPhase !== "ready") {
      return this.reject(this.rollPhase === "spinning" ? "roll-in-progress" : "roll-not-allowed");
    }
    return this.beginRoll("automatic");
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
  }

  private clearRollTimeout(): void {
    if (this.rollTimeout === null) return;
    this.scheduler.clearTimeout(this.rollTimeout);
    this.rollTimeout = null;
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
