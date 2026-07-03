import "./Board.css";
import ChessBoard from "../../engine/ChessBoard";

const board = new ChessBoard();

function getPieceSymbol(type: string, color: string) {
  if (color === "white") {
    switch (type) {
      case "king":
        return "♔";
      case "queen":
        return "♕";
      case "rook":
        return "♖";
      case "bishop":
        return "♗";
      case "knight":
        return "♘";
      case "pawn":
        return "♙";
    }
  }

  switch (type) {
    case "king":
      return "♚";
    case "queen":
      return "♛";
    case "rook":
      return "♜";
    case "bishop":
      return "♝";
    case "knight":
      return "♞";
    case "pawn":
      return "♟";
  }
}

function Board() {
  const squares = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board.squares[row][col];

      const isLight = (row + col) % 2 === 0;

      squares.push(
        <div
          key={`${row}-${col}`}
          className={`square ${isLight ? "light" : "dark"}`}
        >
          {piece && (
            <span className="piece">
              {getPieceSymbol(piece.type, piece.color)}
            </span>
          )}
        </div>
      );
    }
  }

  return <div className="board">{squares}</div>;
}

export default Board;