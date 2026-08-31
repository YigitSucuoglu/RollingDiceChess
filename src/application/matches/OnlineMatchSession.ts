import { ROLL_TIMING } from "../../config/rollTiming";
import type { BoardTheme } from "../../types/BoardTheme";
import type { PieceSet } from "../../types/PieceSet";
import type {
  MatchAction,
  MatchActionRejectionReason,
  MatchActionResult,
  MatchListener,
  MatchSession,
  MatchSnapshot,
  OnlineMatchConfiguration,
} from "../../domain/contracts/MatchContracts";
import { getAuthoritativeSelectableMoves } from "../multiplayer/AuthoritativeMatchEngine";
import type { MultiplayerMatchPort, MultiplayerServerSnapshot } from "../multiplayer/MultiplayerMatchPort";
import type { Move, Position } from "../../types/Chess";
import type { Scheduler, TimeSource } from "../../domain/contracts/PlatformPorts";

const POLL_INTERVAL_MS = 1_500;
const CLOCK_REFRESH_MS = 100;
const UNPLAYABLE_REVIEW_MS = 1_200;
const SKIP_MESSAGE_MS = 1_000;

export interface OnlineMatchPresentation {
  readonly mode: MultiplayerServerSnapshot["mode"];
  readonly white: MultiplayerServerSnapshot["white"];
  readonly black: MultiplayerServerSnapshot["black"];
}

interface OnlineMatchSessionDependencies {
  readonly scheduler: Scheduler;
  readonly timeSource: TimeSource;
  readonly isNetworkOnline: () => boolean;
}

export default class OnlineMatchSession implements MatchSession {
  public readonly configuration: OnlineMatchConfiguration;
  public get presentation(): OnlineMatchPresentation {
    return { mode: this.server.mode, white: this.server.white, black: this.server.black };
  }

  private server: MultiplayerServerSnapshot;
  private readonly port: MultiplayerMatchPort;
  private readonly listeners = new Set<MatchListener>();
  private selectedSquare: Position | null = null;
  private selectedMoves: readonly Move[] = [];
  private rollPhase: "spinning" | "resolved" = "spinning";
  private rollSequence = 1;
  private skipPhase: "none" | "reviewing" | "message" = "none";
  private skipSequence = 0;
  private exitConfirmationOpen = false;
  private connection: MatchSnapshot["connection"] = "connected";
  private disposed = false;
  private pollTimer: unknown | null = null;
  private clockTimer: unknown | null = null;
  private rollTimer: unknown | null = null;
  private skipTimer: unknown | null = null;
  private requestInFlight = false;
  private reconcileInFlight = false;
  private reconcilePending = false;
  private snapshotReceivedAtMs: number;
  private readonly unsubscribeRealtime: () => void;
  private readonly dependencies: OnlineMatchSessionDependencies;

  public constructor(
    initial: MultiplayerServerSnapshot,
    port: MultiplayerMatchPort,
    appearance: { readonly pieceSet: PieceSet; readonly boardTheme: BoardTheme },
    dependencies: OnlineMatchSessionDependencies,
  ) {
    if (!initial.ownSide || !initial.game) throw new Error("Active multiplayer snapshot is incomplete.");
    this.server = initial;
    this.port = port;
    this.dependencies = dependencies;
    this.snapshotReceivedAtMs = dependencies.timeSource.now();
    this.configuration = {
      schemaVersion: 1,
      mode: "online",
      authoritativeMatchId: initial.matchId,
      playerColor: initial.ownSide,
      timeControl: initial.timeControl,
      pieceSet: appearance.pieceSet,
      boardTheme: appearance.boardTheme,
    };
    this.unsubscribeRealtime = this.port.subscribe(initial.matchId, () => this.requestReconcile());
    this.beginRollReveal();
    this.schedulePoll();
    this.scheduleClockRefresh();
  }

  public getSnapshot(): MatchSnapshot {
    const game = this.requireGame();
    const legalMoves = getAuthoritativeSelectableMoves(game);
    const ownTurn = game.currentTurn === this.configuration.playerColor;
    const active = this.server.status === "active" && !this.disposed;
    const canAct = active && ownTurn && this.connection === "connected"
      && this.rollPhase === "resolved" && this.skipPhase === "none"
      && !this.exitConfirmationOpen && !this.requestInFlight && legalMoves.length > 0;
    const clock = this.currentClock();
    return {
      schemaVersion: 1,
      mode: "online",
      authority: "server",
      connection: this.connection,
      lifecycle: this.server.status === "active" ? "active" : "completed",
      terminationReason: this.server.terminationReason,
      exitConfirmationOpen: this.exitConfirmationOpen,
      currentPlayer: game.currentTurn,
      controller: ownTurn ? "human" : "human",
      board: game.board,
      currentRoll: game.currentRoll,
      roll: {
        phase: this.rollPhase,
        visibleRoll: game.currentRoll,
        sequence: this.rollSequence,
        trigger: "automatic",
        canStartManualRoll: false,
      },
      skip: { phase: this.skipPhase, sequence: this.skipSequence },
      capabilities: { canSelect: canAct, canMove: canAct, canStartManualRoll: false },
      hasPlayableMoves: legalMoves.length > 0,
      remainingRights: game.remainingRights,
      selectableMoves: this.selectedMoves,
      selectedSquare: this.selectedSquare,
      clock,
      winner: this.server.winner,
      resultReason: this.server.terminationReason === "timeout" ? "timeout"
        : this.server.winner ? "king-captured" : null,
      moveHistory: game.moveHistory,
    };
  }

  public subscribe(listener: MatchListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async requestAction(action: MatchAction): Promise<MatchActionResult> {
    if (this.disposed) return this.reject("session-disposed");
    if (action.type === "OPEN_EXIT_CONFIRMATION") {
      if (this.server.status !== "active") return this.reject("game-over");
      this.exitConfirmationOpen = true;
      return this.accept();
    }
    if (action.type === "CANCEL_EXIT_CONFIRMATION") {
      if (!this.exitConfirmationOpen) return this.reject("invalid-action");
      this.exitConfirmationOpen = false;
      return this.accept();
    }
    if (action.type === "ABANDON_MATCH") {
      if (!this.exitConfirmationOpen || this.requestInFlight) return this.reject("invalid-action");
      return this.performRemote({ action: "forfeit", matchId: this.server.matchId });
    }
    if (action.type === "START_MANUAL_ROLL") return this.reject("roll-not-allowed");
    if (!this.getSnapshot().capabilities.canSelect) return this.reject("not-active-player");
    if (action.type === "CLEAR_SELECTION") {
      if (!this.selectedSquare) return this.reject("invalid-action");
      this.selectedSquare = null;
      this.selectedMoves = [];
      return this.accept();
    }
    if (action.type === "SELECT_SQUARE") {
      const piece = this.requireGame().board[action.position.row]?.[action.position.col];
      if (!piece || piece.color !== this.configuration.playerColor) return this.reject("invalid-action");
      const moves = getAuthoritativeSelectableMoves(this.requireGame()).filter((move) =>
        move.pieceId === piece.id && this.samePosition(move.from, action.position));
      if (moves.length === 0) return this.reject("invalid-action");
      this.selectedSquare = { ...action.position };
      this.selectedMoves = moves;
      return this.accept();
    }
    const selected = this.selectedMoves.find((move) => move.pieceId === action.pieceId
      && this.samePosition(move.from, action.from) && this.samePosition(move.to, action.to));
    if (!selected) return this.reject("illegal-move");
    return this.performRemote({
      action: "move",
      matchId: this.server.matchId,
      expectedRevision: this.server.revision,
      from: action.from,
      to: action.to,
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.unsubscribeRealtime();
    this.listeners.clear();
  }

  private async performRemote(intent: Parameters<MultiplayerMatchPort["request"]>[0]): Promise<MatchActionResult> {
    if (this.requestInFlight) return this.reject("invalid-action");
    this.requestInFlight = true;
    this.publish();
    try {
      this.applyServerSnapshot(await this.port.request(intent));
      this.exitConfirmationOpen = false;
      return { accepted: true, snapshot: this.getSnapshot() };
    } catch {
      this.connection = "reconnecting";
      this.reconcilePending = true;
      return this.reject("invalid-action");
    } finally {
      this.requestInFlight = false;
      this.publish();
      this.flushPendingReconcile();
    }
  }

  private async reconcile(): Promise<void> {
    if (this.disposed || this.requestInFlight || this.reconcileInFlight) {
      this.reconcilePending = true;
      return;
    }
    this.reconcileInFlight = true;
    try {
      this.applyServerSnapshot(await this.port.request({ action: "heartbeat", matchId: this.server.matchId }));
      this.connection = "connected";
    } catch {
      this.connection = this.dependencies.isNetworkOnline() ? "reconnecting" : "disconnected";
      this.publish();
    } finally {
      this.reconcileInFlight = false;
      this.flushPendingReconcile();
    }
  }

  private requestReconcile(): void {
    this.reconcilePending = true;
    this.flushPendingReconcile();
  }

  private flushPendingReconcile(): void {
    if (this.disposed || !this.reconcilePending || this.requestInFlight || this.reconcileInFlight) return;
    this.reconcilePending = false;
    void this.reconcile();
  }

  private applyServerSnapshot(next: MultiplayerServerSnapshot): void {
    if (next.revision < this.server.revision) return;
    const revisionChanged = next.revision > this.server.revision;
    const previousRoll = this.server.game?.currentRoll.join("|");
    const previousTurn = this.server.game?.currentTurn;
    this.server = next;
    this.snapshotReceivedAtMs = this.dependencies.timeSource.now();
    if (revisionChanged) {
      this.selectedSquare = null;
      this.selectedMoves = [];
    }
    if (next.game && (previousRoll !== next.game.currentRoll.join("|") || previousTurn !== next.game.currentTurn)) {
      this.beginRollReveal();
    }
    if (next.status !== "active") this.clearTimers();
    this.publish();
  }

  private beginRollReveal(): void {
    if (this.rollTimer !== null) this.dependencies.scheduler.clearTimeout(this.rollTimer);
    if (this.skipTimer !== null) this.dependencies.scheduler.clearTimeout(this.skipTimer);
    this.rollPhase = "spinning";
    this.skipPhase = "none";
    this.rollSequence++;
    this.rollTimer = this.dependencies.scheduler.setTimeout(() => {
      this.rollTimer = null;
      if (this.disposed || this.server.status !== "active") return;
      this.rollPhase = "resolved";
      this.publish();
      this.ensureUnplayableLifecycle();
    }, ROLL_TIMING.durationMs);
  }

  private ensureUnplayableLifecycle(): void {
    if (this.disposed || this.server.status !== "active" || this.rollPhase !== "resolved"
        || getAuthoritativeSelectableMoves(this.requireGame()).length > 0 || this.skipPhase !== "none") return;
    this.skipPhase = "reviewing";
    this.publish();
    const revision = this.server.revision;
    this.skipTimer = this.dependencies.scheduler.setTimeout(() => {
      this.skipPhase = "message";
      this.skipSequence++;
      this.publish();
      this.skipTimer = this.dependencies.scheduler.setTimeout(() => {
        this.skipTimer = null;
        if (this.server.revision !== revision || this.server.status !== "active") return;
        void this.performRemote({ action: "advance-unplayable", matchId: this.server.matchId, expectedRevision: revision });
      }, SKIP_MESSAGE_MS);
    }, UNPLAYABLE_REVIEW_MS);
  }

  private currentClock(): MatchSnapshot["clock"] {
    const active = this.server.status === "active" ? this.requireGame().currentTurn : null;
    const started = this.server.clock.activeTurnStartedAt ? Date.parse(this.server.clock.activeTurnStartedAt) : null;
    const serverNow = Date.parse(this.server.clock.serverNow);
    const elapsedAtReceipt = active && started !== null && Number.isFinite(serverNow)
      ? Math.max(0, serverNow - started) : 0;
    const elapsed = active ? elapsedAtReceipt + Math.max(0, this.dependencies.timeSource.now() - this.snapshotReceivedAtMs) : 0;
    const whiteBase = this.server.clock.whiteRemainingMs ?? 0;
    const blackBase = this.server.clock.blackRemainingMs ?? 0;
    return {
      whiteRemainingMs: Math.max(0, whiteBase - (active === "white" ? elapsed : 0)),
      blackRemainingMs: Math.max(0, blackBase - (active === "black" ? elapsed : 0)),
      activeColor: active,
      isRunning: Boolean(active),
      timedOutColor: null,
      incrementMs: this.server.timeControl.incrementMs,
    };
  }

  private schedulePoll(): void {
    this.pollTimer = this.dependencies.scheduler.setTimeout(() => {
      this.pollTimer = null;
      void this.reconcile().finally(() => { if (!this.disposed) this.schedulePoll(); });
    }, POLL_INTERVAL_MS);
  }

  private scheduleClockRefresh(): void {
    this.clockTimer = this.dependencies.scheduler.setTimeout(() => {
      this.clockTimer = null;
      this.publish();
      if (!this.disposed && this.server.status === "active") this.scheduleClockRefresh();
    }, CLOCK_REFRESH_MS);
  }

  private clearTimers(): void {
    for (const timer of [this.pollTimer, this.clockTimer, this.rollTimer, this.skipTimer]) {
      if (timer !== null) this.dependencies.scheduler.clearTimeout(timer);
    }
    this.pollTimer = this.clockTimer = this.rollTimer = this.skipTimer = null;
  }

  private accept(): MatchActionResult {
    const snapshot = this.getSnapshot();
    this.publish(snapshot);
    return { accepted: true, snapshot };
  }

  private reject(reason: MatchActionRejectionReason): MatchActionResult {
    return { accepted: false, reason, snapshot: this.getSnapshot() };
  }

  private publish(snapshot: MatchSnapshot = this.getSnapshot()): void {
    if (!this.disposed) for (const listener of this.listeners) listener(snapshot);
  }

  private requireGame() {
    if (!this.server.game) throw new Error("Canonical game state is unavailable.");
    return this.server.game;
  }

  private samePosition(first: Readonly<Position>, second: Readonly<Position>): boolean {
    return first.row === second.row && first.col === second.col;
  }
}
