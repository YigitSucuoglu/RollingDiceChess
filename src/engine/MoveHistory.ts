import type {
  Move,
  PieceColor,
  PieceType,
  Position,
} from "../types/Chess";
import NotationGenerator from "./NotationGenerator";

export interface MoveHistoryEntry {
  turnNumber: number;
  player: PieceColor;
  moveIndex: number;
  notation: string;
  piece: PieceType;
  from: Position;
  to: Position;
  capture: boolean;
  promotion: boolean;
  castle: boolean;
  enPassant: boolean;
  timestamp: number;
}

export interface TurnHistory {
  turnNumber: number;
  whiteMoves: MoveHistoryEntry[];
  blackMoves: MoveHistoryEntry[];
}

export default class MoveHistory {
  private readonly turns: TurnHistory[];

  private readonly notationGenerator: NotationGenerator;

  private currentTurnNumber: number;

  private sequence: number;

  constructor() {
    this.turns = [];
    this.notationGenerator = new NotationGenerator();
    this.currentTurnNumber = 1;
    this.sequence = 0;
    this.ensureTurn(this.currentTurnNumber);
  }

  public recordMove(move: Move, player: PieceColor, piece: PieceType): void {
    const turn = this.ensureTurn(this.currentTurnNumber);
    const playerMoves = player === "white" ? turn.whiteMoves : turn.blackMoves;

    this.sequence++;

    playerMoves.push({
      turnNumber: this.currentTurnNumber,
      player,
      moveIndex: playerMoves.length + 1,
      notation: this.notationGenerator.generate(move, piece),
      piece,
      from: { ...move.from },
      to: { ...move.to },
      capture: move.isCapture,
      promotion: move.isPromotion,
      castle: move.isCastle,
      enPassant: move.isEnPassant,
      timestamp: this.sequence,
    });
  }

  public startPlayerTurn(player: PieceColor): void {
    if (player === "white") {
      this.currentTurnNumber++;
    }

    this.ensureTurn(this.currentTurnNumber);
  }

  public getSnapshot(): readonly TurnHistory[] {
    return this.turns.map((turn) => ({
      turnNumber: turn.turnNumber,
      whiteMoves: turn.whiteMoves.map((move) => this.cloneEntry(move)),
      blackMoves: turn.blackMoves.map((move) => this.cloneEntry(move)),
    }));
  }

  private ensureTurn(turnNumber: number): TurnHistory {
    let turn = this.turns.find((entry) => entry.turnNumber === turnNumber);

    if (!turn) {
      turn = {
        turnNumber,
        whiteMoves: [],
        blackMoves: [],
      };
      this.turns.push(turn);
    }

    return turn;
  }

  private cloneEntry(entry: MoveHistoryEntry): MoveHistoryEntry {
    return {
      ...entry,
      from: { ...entry.from },
      to: { ...entry.to },
    };
  }
}
