import type {
  GameResultReason,
  Move,
  PieceColor,
  PieceType,
  Position,
} from "../types/Chess";
import ChessBoard from "./ChessBoard";
import TurnRights from "./TurnRights";
import { createSimulationState } from "./Simulation";
import TurnResolver, { type TurnResolution } from "./TurnResolver";
import DiceEngine from "./DiceEngine";
import MoveHistory from "./MoveHistory";
import { createDefaultGameSetup } from "../config/gameSetup";
import type { GameSetup } from "../types/GameSetup";
import BotController, { type Bot } from "./BotController";
import ChessClock from "./ChessClock";

export default class Game {
  public board: ChessBoard;

  public selectedSquare: Position | null;

  public possibleMoves: Move[];

  public lastMove: Move | null;

  public winner: PieceColor | null;

  public resultReason: GameResultReason | null;

  public turnRights!: TurnRights;

  public currentRoll!: readonly [PieceType, PieceType, PieceType];

  public readonly moveHistory: MoveHistory;

  public readonly setup: GameSetup;

  public readonly clock: ChessClock;

  private turnResolver: TurnResolver;

  private diceEngine: DiceEngine;

  private readonly bot: Bot;

  private readonly listeners: Set<() => void>;


  constructor(
    setup: GameSetup = createDefaultGameSetup(),
    bot: Bot = new BotController(setup.botColor)
  ) {
    this.board = new ChessBoard();
    this.selectedSquare = null;
    this.possibleMoves = [];
    this.lastMove = null;
    this.winner = null;
    this.resultReason = null;
    this.turnResolver = new TurnResolver();
    this.diceEngine = new DiceEngine();
    this.moveHistory = new MoveHistory();
    this.setup = setup;
    this.bot = bot;
    this.listeners = new Set();
    this.clock = new ChessClock(
      setup.timeControl.initialMinutes,
      setup.timeControl.incrementSeconds,
      (timedOutColor) => this.handleTimeout(timedOutColor)
    );
    this.initializeTurnRights();
  }

  public selectSquare(row: number, col: number): void {
    
    if (this.winner) {
        return;
    }
    
    const piece = this.board.squares[row][col];

    if (!piece) {
      this.selectedSquare = null;
      this.possibleMoves = [];
      return;
    }

    if (piece.color !== this.currentTurn) {
      this.selectedSquare = null;
      this.possibleMoves = [];
      return;
    }
    
    if (!this.turnRights.has(piece.type)) {
      this.selectedSquare = null;
      this.possibleMoves = [];
      return;
    }

    const resolution = this.getTurnResolution();
    const approvedMoves = resolution.selectableMoves.filter(
      (move) =>
        move.from.row === row &&
        move.from.col === col &&
        move.pieceId === piece.id
    );

    if (approvedMoves.length === 0) {
      this.selectedSquare = null;
      this.possibleMoves = [];
      return;
    }

    this.selectedSquare = { row, col };
    this.possibleMoves = approvedMoves;
  }
  
  public currentTurn: PieceColor = "white";

  public isBotTurn(): boolean {
    return this.currentTurn === this.setup.botColor;
  }

  public getSelectableMoves(): readonly Move[] {
    return this.getTurnResolution().selectableMoves;
  }

  public hasPlayableMoves(): boolean {
    return this.getTurnResolution().maxConsumableRights > 0;
  }

  public skipUnplayableTurn(): boolean {
    if (this.winner || this.hasPlayableMoves()) {
      return false;
    }

    this.selectedSquare = null;
    this.possibleMoves = [];
    this.clock.stop();
    this.startNextTurn();

    return true;
  }

  public playBotTurn(
    onMove?: () => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (this.winner || !this.isBotTurn()) {
      return Promise.resolve();
    }

    return this.bot.playTurn(this, onMove, signal);
  }

  public startClockForCurrentTurn(): boolean {
    if (this.winner || !this.hasPlayableMoves()) {
      return false;
    }

    return this.clock.start(this.currentTurn);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    this.clock.dispose();
    this.listeners.clear();
  }
  
  public makeMove(move: Move): void {
    if (this.winner) {
      return;
    }

    this.clock.getRemainingTime(this.currentTurn);

    if (this.winner) {
      return;
    }

    const resolution = this.getTurnResolution();
    const isApproved = resolution.selectableMoves.some(
      (approvedMove) =>
        approvedMove.pieceId === move.pieceId &&
        approvedMove.from.row === move.from.row &&
        approvedMove.from.col === move.from.col &&
        approvedMove.to.row === move.to.row &&
        approvedMove.to.col === move.to.col &&
        approvedMove.isCapture === move.isCapture &&
        approvedMove.isCastle === move.isCastle &&
        approvedMove.isPromotion === move.isPromotion &&
        approvedMove.isEnPassant === move.isEnPassant
    );

    if (!isApproved) {
      return;
    }

    const piece = this.board.squares[move.from.row][move.from.col];
    const capturedPiece = this.board.squares[move.to.row][move.to.col];

    if (!piece) return;

    const movedPieceType = piece.type;

    this.board.squares[move.to.row][move.to.col] = piece;
    this.board.squares[move.from.row][move.from.col] = null;

    piece.hasMoved = true;

    this.turnRights.consume(piece.type);

    if (move.isEnPassant) {
      const capturedRow =
        piece.color === "white"
          ? move.to.row + 1
          : move.to.row - 1;

      this.board.squares[capturedRow][move.to.col] = null;
    }

    if (move.isCastle) {

      // Kısa rok
      if (move.to.col === 6) {

        const rook = this.board.squares[move.from.row][7];

        if (rook) {
          this.board.squares[move.from.row][5] = rook;
          this.board.squares[move.from.row][7] = null;
          rook.hasMoved = true;
        }

      }

      // Uzun rok
      else if (move.to.col === 2) {

        const rook = this.board.squares[move.from.row][0];

        if (rook) {
          this.board.squares[move.from.row][3] = rook;
          this.board.squares[move.from.row][0] = null;
          rook.hasMoved = true;
        }

      }

    }

    if (
      piece.type === "pawn" &&
      (
        (piece.color === "white" && move.to.row === 0) ||
        (piece.color === "black" && move.to.row === 7)
      )
    ) {
      piece.type = "queen";
    }    



    this.lastMove = move;

    this.moveHistory.recordMove(move, piece.color, movedPieceType);

    if (capturedPiece?.type === "king") {
      this.winner = piece.color;
      this.resultReason = "king-captured";
      this.clock.stop();
    }

    this.selectedSquare = null;
    this.possibleMoves = [];

    if (this.winner) {
      return;
    }

    const nextResolution = this.getTurnResolution();

    if (nextResolution.maxConsumableRights === 0) {
      this.clock.completeTurn(this.currentTurn);

      if (this.winner) {
        return;
      }

      this.startNextTurn();
    }   
  }

  private initializeTurnRights(): void {
    const roll = this.diceEngine.roll();
    const rights = new TurnRights();

    for (const pieceType of roll) {
      rights.set(pieceType, rights.get(pieceType) + 1);
    }

    this.currentRoll = roll;
    this.turnRights = rights;
  }

  private getTurnResolution(): TurnResolution {
    const state = createSimulationState(this);

    return this.turnResolver.resolve(state);
  }

  private startNextTurn(): void {
    this.currentTurn =
      this.currentTurn === "white"
        ? "black"
        : "white";
    this.moveHistory.startPlayerTurn(this.currentTurn);
    this.initializeTurnRights();
  }

  private handleTimeout(timedOutColor: PieceColor): void {
    if (this.winner) {
      return;
    }

    this.winner = timedOutColor === "white" ? "black" : "white";
    this.resultReason = "timeout";
    this.selectedSquare = null;
    this.possibleMoves = [];
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

}
