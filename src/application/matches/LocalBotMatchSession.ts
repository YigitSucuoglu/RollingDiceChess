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
    const history = this.game.moveHistory.getSnapshot().flatMap((turn) => [
      ...turn.whiteMoves,
      ...turn.blackMoves,
    ]);

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
      selectableMoves: this.game.getSelectableMoves().map((move) => ({
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
    if (this.disposed) return { accepted: false, snapshot: this.getSnapshot() };

    let accepted = false;
    switch (action.type) {
      case "SELECT_SQUARE":
        this.game.selectSquare(action.row, action.col);
        accepted = this.game.selectedSquare?.row === action.row &&
          this.game.selectedSquare.col === action.col;
        break;
      case "MAKE_MOVE": {
        const before = this.game.lastMove;
        this.game.makeMove(action.move);
        accepted = this.game.lastMove !== before;
        break;
      }
      case "SKIP_UNPLAYABLE_TURN":
        accepted = this.game.skipUnplayableTurn();
        break;
      case "START_CLOCK":
        accepted = this.game.startClockForCurrentTurn();
        break;
    }

    if (accepted) this.publish();
    return { accepted, snapshot: this.getSnapshot() };
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

  private publish(): void {
    if (this.disposed) return;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
