import "./Board.css";
import gameManager from "../../engine/GameManager";
import Piece from "../Piece/Piece";
import { useState } from "react";



function Board() {
  const game = gameManager.getGame();

  const [, setRefresh] = useState(0);

  const squares = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.board.squares[row][col];
      const isSelected =
      game.selectedSquare?.row === row &&
      game.selectedSquare?.col === col;

      const isLight = (row + col) % 2 === 0;

      squares.push(
        <div
            key={`${row}-${col}`}
            className={`square ${isLight ? "light" : "dark"} ${
              isSelected ? "selected" : ""
            }`}
            onClick={() => {
              if (!piece) return;

              game.selectedSquare = { row, col };

              setRefresh((v) => v + 1);
            }}
          >
          {piece && <Piece piece={piece} />}
        </div>
      );
    }
  }

  return <div className="board">{squares}</div>;
}

export default Board;