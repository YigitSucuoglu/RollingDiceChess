import type { Move, Piece } from "../types/Chess";
import ChessBoard from "./ChessBoard";

export default class MoveGenerator {

    public static generateMoves(
        board: ChessBoard,
        row: number,
        col: number
    ): Move[] {

        const piece = board.squares[row][col];

        if (!piece)
            return [];

        switch (piece.type) {

            case "pawn":
                return this.generatePawnMoves(board, piece, row, col);

            default:
                return [];
        }

    }

    private static generatePawnMoves(
        board: ChessBoard,
        piece: Piece,
        row: number,
        col: number
    ): Move[] {

        const moves: Move[] = [];

        const direction = piece.color === "white" ? -1 : 1;

        const nextRow = row + direction;

        if (
            nextRow >= 0 &&
            nextRow < 8 &&
            board.squares[nextRow][col] === null
        ) {
            moves.push({
                from: { row, col },
                to: { row: nextRow, col }
            });
        }

        return moves;
    }

}