import "./Board.css";

function Board() {
  const squares = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;

      squares.push(
        <div
          key={`${row}-${col}`}
          className={`square ${isLight ? "light" : "dark"}`}
        />
      );
    }
  }

  return <div className="board">{squares}</div>;
}

export default Board;