import type { Move, Piece } from "../types/Chess";
import ChessBoard from "./ChessBoard";

export default class MoveGenerator {
  public static generateMoves(
    board: ChessBoard,
    row: number,
    col: number
  ): Move[] {
    const piece = board.squares[row][col];

    if (!piece) return [];

    switch (piece.type) {
      
      case "pawn":
        return this.generatePawnMoves(board, piece, row, col);
      
      case "knight":
        return this.generateKnightMoves(board, piece, row, col);
      default:
        return [];

      case "bishop":
        return this.generateSlidingMoves(
            board,
            piece,
            row,
            col,
            [
                [-1, -1],
                [-1, 1],
                [1, -1],
                [1, 1]
            ]
        );

      case "rook":
        return this.generateSlidingMoves(
          board,
          piece,
          row,
          col,
          [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]
        );
      
      case "queen":
        return this.generateSlidingMoves(
          board,
          piece,
          row,
          col,
          [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
          ]
        );  
      
      case "king":
        return this.generateKingMoves(board, piece, row, col);     
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

    // 1 kare ileri
    if (
      nextRow >= 0 &&
      nextRow < 8 &&
      board.squares[nextRow][col] === null
    ) {
      moves.push({
        from: { row, col },
        to: { row: nextRow, col },

        isCapture: false,
        isCastle: false,
        isPromotion: false,
        isEnPassant: false,
      });

      // İlk hamlede 2 kare
      const startRow = piece.color === "white" ? 6 : 1;
      const doubleRow = row + direction * 2;

      if (
        row === startRow &&
        board.squares[doubleRow][col] === null
      ) {
        moves.push({
          from: { row, col },
          to: { row: doubleRow, col },

          isCapture: false,
          isCastle: false,
          isPromotion: false,
          isEnPassant: false,
        });
      }
    }

    // Sol çapraz alma
    const leftCol = col - 1;

    if (
      nextRow >= 0 &&
      nextRow < 8 &&
      leftCol >= 0
    ) {
      const target = board.squares[nextRow][leftCol];

      if (target !== null && target.color !== piece.color) {
        moves.push({
          from: { row, col },
          to: { row: nextRow, col: leftCol },

          isCapture: true,
          isCastle: false,
          isPromotion: false,
          isEnPassant: false,
        });
      }
    }

    // Sağ çapraz alma
    const rightCol = col + 1;

    if (
      nextRow >= 0 &&
      nextRow < 8 &&
      rightCol < 8
    ) {
      const target = board.squares[nextRow][rightCol];

      if (target !== null && target.color !== piece.color) {
        moves.push({
          from: { row, col },
          to: { row: nextRow, col: rightCol },

          isCapture: true,
          isCastle: false,
          isPromotion: false,
          isEnPassant: false,
        });
      }
    }

    return moves;
  }

  private static generateKnightMoves(
    board: ChessBoard,
    piece: Piece,
    row: number,
    col: number
  ): Move[] {

    const moves: Move[] = [];

    const offsets = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];

    for (const [rowOffset, colOffset] of offsets) {

      const newRow = row + rowOffset;
      const newCol = col + colOffset;

      if (
        newRow < 0 ||
        newRow >= 8 ||
        newCol < 0 ||
        newCol >= 8
      ) {
        continue;
      }

      const target = board.squares[newRow][newCol];

      if (target === null) {

        moves.push({
          from: { row, col },
          to: { row: newRow, col: newCol },

          isCapture: false,
          isCastle: false,
          isPromotion: false,
          isEnPassant: false,
        });

        continue;
      }

      if (target.color !== piece.color) {

        moves.push({
          from: { row, col },
          to: { row: newRow, col: newCol },

          isCapture: true,
          isCastle: false,
          isPromotion: false,
          isEnPassant: false,
        });

      }

    }

    return moves;
  }

    private static generateSlidingMoves(
      board: ChessBoard,
      piece: Piece,
      row: number,
      col: number,
      directions: number[][]
    ): Move[] {

      const moves: Move[] = [];

      for (const [rowDir, colDir] of directions) {

          let currentRow = row + rowDir;
          let currentCol = col + colDir;

          while (
              currentRow >= 0 &&
              currentRow < 8 &&
              currentCol >= 0 &&
              currentCol < 8
          ) {

              const target = board.squares[currentRow][currentCol];

              if (target === null) {

                  moves.push({
                      from: { row, col },
                      to: {
                          row: currentRow,
                          col: currentCol
                      },

                      isCapture: false,
                      isCastle: false,
                      isPromotion: false,
                      isEnPassant: false
                  });

              } else {

                  if (target.color !== piece.color) {

                      moves.push({
                          from: { row, col },
                          to: {
                              row: currentRow,
                              col: currentCol
                          },

                          isCapture: true,
                          isCastle: false,
                          isPromotion: false,
                          isEnPassant: false
                      });

                  }

                  break;
              }

              currentRow += rowDir;
              currentCol += colDir;

          }

      }

      return moves;
  }

    private static generateKingMoves(
      board: ChessBoard,
      piece: Piece,
      row: number,
      col: number
    ): Move[] {

      const moves: Move[] = [];

      const offsets = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ];

      for (const [rowOffset, colOffset] of offsets) {

        const newRow = row + rowOffset;
        const newCol = col + colOffset;

        if (
          newRow < 0 ||
          newRow >= 8 ||
          newCol < 0 ||
          newCol >= 8
        ) {
          continue;
        }

        const target = board.squares[newRow][newCol];

        if (target === null) {

          moves.push({
            from: { row, col },
            to: { row: newRow, col: newCol },

            isCapture: false,
            isCastle: false,
            isPromotion: false,
            isEnPassant: false,
          });

          continue;
        }

        if (target.color !== piece.color) {

          moves.push({
            from: { row, col },
            to: { row: newRow, col: newCol },

            isCapture: true,
            isCastle: false,
            isPromotion: false,
            isEnPassant: false,
          });

        }

      }
      if (!piece.hasMoved) {
        this.generateCastlingMoves(board, piece, row, col, moves);
      }

      return moves;

    }

    private static generateCastlingMoves(
      board: ChessBoard,
      king: Piece,
      row: number,
      col: number,
      moves: Move[]
    ): void {

      // King side
      const kingSideRook = board.squares[row][7];

      if (
        kingSideRook &&
        kingSideRook.type === "rook" &&
        kingSideRook.color === king.color &&
        !kingSideRook.hasMoved &&
        !board.squares[row][5] &&
        !board.squares[row][6]
      ) {
        moves.push({
          from: { row, col },
          to: { row, col: 6 },

          isCapture: false,
          isCastle: true,
          isPromotion: false,
          isEnPassant: false,
        });
      }

      // Queen side
      const queenSideRook = board.squares[row][0];

      if (
        queenSideRook &&
        queenSideRook.type === "rook" &&
        queenSideRook.color === king.color &&
        !queenSideRook.hasMoved &&
        !board.squares[row][1] &&
        !board.squares[row][2] &&
        !board.squares[row][3]
      ) {
        moves.push({
          from: { row, col },
          to: { row, col: 2 },

          isCapture: false,
          isCastle: true,
          isPromotion: false,
          isEnPassant: false,
        });
      }

    }

}