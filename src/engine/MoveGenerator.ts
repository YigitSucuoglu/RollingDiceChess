import type { Move, Piece } from "../types/Chess";
import ChessBoard from "./ChessBoard";

export default class MoveGenerator {
  public static generateMoves(
    board: ChessBoard,
    row: number,
    col: number,
    lastMove: Move | null
  ): Move[] {
    const piece = board.squares[row][col];

    if (!piece) return [];

    switch (piece.type) {
      
      case "pawn":
        return this.generatePawnMoves(
          board,
          piece,
          row,
          col,
          lastMove
        );
      
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
    col: number,
    lastMove: Move | null
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
        pieceId: piece.id,
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
          pieceId: piece.id,
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
          pieceId: piece.id,
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
          pieceId: piece.id,
        });
      }
    }

    this.generateEnPassantMoves(
        board,
        piece,
        row,
        col,
        moves,
        lastMove
    );    

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
          pieceId: piece.id,
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
          pieceId: piece.id,
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
                      isEnPassant: false,
                      pieceId: piece.id,
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
                          isEnPassant: false,
                          pieceId: piece.id,
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
            pieceId: piece.id,
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
            pieceId: piece.id,
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
          pieceId: king.id,
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
          pieceId: king.id,
        });
      }

    }

    private static generateEnPassantMoves(
      board: ChessBoard,
      piece: Piece,
      row: number,
      col: number,
      moves: Move[],
      lastMove: Move | null
    ): void {
      if (!lastMove) return;

      const direction = piece.color === "white" ? -1 : 1;

      // ---------- Right ----------
      const rightPiece = board.squares[row][col + 1];

      if (
        rightPiece &&
        rightPiece.type === "pawn" &&
        rightPiece.color !== piece.color &&
        lastMove.pieceId === rightPiece.id &&
        Math.abs(lastMove.from.row - lastMove.to.row) === 2 &&
        lastMove.to.row === row &&
        lastMove.to.col === col + 1 &&
        !board.squares[row + direction][col + 1]
      ) {
        moves.push({
          from: { row, col },
          to: {
            row: row + direction,
            col: col + 1,
          },

          isCapture: true,
          isCastle: false,
          isPromotion: false,
          isEnPassant: true,

          pieceId: piece.id,
        });
      }

      // ---------- Left ----------
      const leftPiece = board.squares[row][col - 1];

      if (
        leftPiece &&
        leftPiece.type === "pawn" &&
        leftPiece.color !== piece.color &&
        lastMove.pieceId === leftPiece.id &&
        Math.abs(lastMove.from.row - lastMove.to.row) === 2 &&
        lastMove.to.row === row &&
        lastMove.to.col === col - 1 &&
        !board.squares[row + direction][col - 1]
      ) {
        moves.push({
          from: { row, col },
          to: {
            row: row + direction,
            col: col - 1,
          },

          isCapture: true,
          isCastle: false,
          isPromotion: false,
          isEnPassant: true,

          pieceId: piece.id,
        });
      }
    }
  
}