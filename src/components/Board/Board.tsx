import "./Board.css";
import gameManager from "../../engine/GameManager";
import Piece from "../Piece/Piece";

const game = gameManager.getGame();

function Board() {
  const squares = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.board.squares[row][col];

      const isLight = (row + col) % 2 === 0;

      squares.push(
        <div
          key={`${row}-${col}`}
          className={`square ${isLight ? "light" : "dark"}`}
        >
          {piece && <Piece piece={piece} />}
        </div>
      );
    }
  }

  return <div className="board">{squares}</div>;
}

export default Board;