import type Game from "../../engine/Game";
import type { MatchXpProgressionResult } from "../../profile/ProfileProgression";
import type {
  LocalBotMatchConfiguration,
  MatchAction,
  MatchActionResult,
  MatchListener,
  MatchSession,
  MatchSnapshot,
} from "../../domain/contracts/MatchContracts";

export default class LocalBotMatchSession implements MatchSession {
  public readonly game: Game;

  public readonly configuration: LocalBotMatchConfiguration;

  private readonly listeners = new Set<MatchListener>();

  private readonly getXpProgression: () => MatchXpProgressionResult | null;

  private readonly unsubscribeGame: () => void;

  private disposed = false;

  public constructor(
    game: Game,
    configuration: LocalBotMatchConfiguration,
    getXpProgression: () => MatchXpProgressionResult | null = () => null,
  ) {
    this.game = game;
    this.configuration = configuration;
    this.getXpProgression = getXpProgression;
    this.unsubscribeGame = game.subscribe(() => this.publish());
  }

  public getSnapshot(): MatchSnapshot {
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
    this.unsubscribeGame();
    this.listeners.clear();
    this.game.dispose();
  }

  private publish(snapshot: MatchSnapshot = this.getSnapshot()): void {
    if (this.disposed) return;
    for (const listener of this.listeners) listener(snapshot);
  }

  private reject(reason: "illegal-move" | "invalid-action" | "not-active-player" | "session-disposed"): MatchActionResult {
    return { accepted: false, reason, snapshot: this.getSnapshot() };
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
