import type { Piece, PieceColor, Position } from "../types/Chess";
import MoveGenerator from "./MoveGenerator";
import type { SimulationState } from "./Simulation";

export interface PositionalScore {
  readonly centerScore: number;
  readonly developmentScore: number;
  readonly mobilityScore: number;
  readonly totalPositionalScore: number;
}

const PRIMARY_CENTER_SCORE = 20;
const SECONDARY_CENTER_SCORE = 8;
const DEVELOPMENT_SCORE = 12;
const MOBILITY_MULTIPLIER = 2;

const PRIMARY_CENTER = new Set(["3,3", "3,4", "4,3", "4,4"]);
const SECONDARY_CENTER = new Set([
  "2,2",
  "2,3",
  "2,4",
  "2,5",
  "3,2",
  "3,5",
  "4,2",
  "4,5",
  "5,2",
  "5,3",
  "5,4",
  "5,5",
]);

const MINOR_STARTING_SQUARES = {
  white: {
    knight: new Set(["7,1", "7,6"]),
    bishop: new Set(["7,2", "7,5"]),
  },
  black: {
    knight: new Set(["0,1", "0,6"]),
    bishop: new Set(["0,2", "0,5"]),
  },
} as const;

export default class PositionalEvaluator {
  public evaluate(
    state: SimulationState,
    botColor: PieceColor
  ): PositionalScore {
    let centerScore = 0;
    let developmentScore = 0;
    let botMobility = 0;
    let opponentMobility = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board.squares[row][col];

        if (!piece) {
          continue;
        }

        const perspective = piece.color === botColor ? 1 : -1;

        centerScore +=
          perspective * this.getCenterValue(piece, { row, col });
        developmentScore +=
          perspective * this.getDevelopmentValue(piece, { row, col });

        const moveCount = MoveGenerator.generateMoves(
          state.board,
          row,
          col,
          state.lastMove
        ).length;

        if (piece.color === botColor) {
          botMobility += moveCount;
        } else {
          opponentMobility += moveCount;
        }
      }
    }

    const mobilityScore =
      (botMobility - opponentMobility) * MOBILITY_MULTIPLIER;

    return {
      centerScore,
      developmentScore,
      mobilityScore,
      totalPositionalScore:
        centerScore + developmentScore + mobilityScore,
    };
  }

  private getCenterValue(piece: Piece, position: Position): number {
    if (piece.type === "king") {
      return 0;
    }

    const positionKey = this.getPositionKey(position);

    if (PRIMARY_CENTER.has(positionKey)) {
      return PRIMARY_CENTER_SCORE;
    }

    return SECONDARY_CENTER.has(positionKey)
      ? SECONDARY_CENTER_SCORE
      : 0;
  }

  private getDevelopmentValue(piece: Piece, position: Position): number {
    if (piece.type !== "knight" && piece.type !== "bishop") {
      return 0;
    }

    const startingSquares = MINOR_STARTING_SQUARES[piece.color][piece.type];
    const initialPositionKey = this.getPositionKey(piece.initialPosition);
    const currentPositionKey = this.getPositionKey(position);

    return startingSquares.has(initialPositionKey) &&
      currentPositionKey !== initialPositionKey
      ? DEVELOPMENT_SCORE
      : 0;
  }

  private getPositionKey(position: Readonly<Position>): string {
    return `${position.row},${position.col}`;
  }
}
