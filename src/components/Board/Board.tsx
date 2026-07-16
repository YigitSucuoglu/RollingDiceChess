import "./Board.css";
import gameManager from "../../engine/GameManager";
import Piece from "../Piece/Piece";
import { useState } from "react";
import type { PieceType } from "../../types/Chess";

const RIGHT_LABELS: readonly [PieceType, string][] = [
  ["pawn", "Pawn"],
  ["knight", "Knight"],
  ["bishop", "Bishop"],
  ["rook", "Rook"],
  ["queen", "Queen"],
  ["king", "King"],
];

function Board() {
  const game = gameManager.getGame();

  const [, setRefresh] = useState(0);
  const rights = game.turnRights.getSnapshot();
  const activeRights = RIGHT_LABELS.filter(
    ([pieceType]) => rights[pieceType] > 0
  );

  const squares = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.board.squares[row][col];

      const isSelected =
        game.selectedSquare?.row === row &&
        game.selectedSquare?.col === col;

      const isPossibleMove = game.possibleMoves.some(
        (move) => move.to.row === row && move.to.col === col
      );

      const isLight = (row + col) % 2 === 0;

      squares.push(
        <div
          key={`${row}-${col}`}
          className={`square ${isLight ? "light" : "dark"} ${
            isSelected ? "selected" : ""
          }`}
          onClick={() => {
            const move = game.possibleMoves.find(
              (m) => m.to.row === row && m.to.col === col
            );

            if (move) {

              game.makeMove(move);

              setRefresh((v) => v + 1);

              return;
            }

            game.selectSquare(row, col);

            setRefresh((v) => v + 1);
          }}
        >
          {piece && <Piece piece={piece} />}

          {isPossibleMove && <div className="move-dot" />}
        </div>
      );
    }
  }

  return (
    <div className="game-layout">
      <div className="turn-panel" aria-live="polite">
        {game.winner ? (
          <div className="winner-text">
            {game.winner === "white" ? "White" : "Black"} wins
          </div>
        ) : (
          <>
            <div className="turn-text">
              {game.currentTurn === "white" ? "White" : "Black"} turn
            </div>

            <div className="roll-section">
              <div className="panel-label">Current roll</div>

              <div className="roll-slots">
                {game.currentRoll.map((pieceType, index) => (
                  <div
                    className="roll-slot"
                    data-piece-type={pieceType}
                    key={`${index}-${pieceType}`}
                  >
                    {RIGHT_LABELS.find(([type]) => type === pieceType)?.[1]}
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-label">Remaining rights</div>

            <div className="rights-list">
              {activeRights.map(([pieceType, label]) => (
                <span className="right-item" key={pieceType}>
                  {label} ×{rights[pieceType]}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="board">{squares}</div>
    </div>
  );
}

export default Board;
