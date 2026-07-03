import Board from "../components/Board/Board";

function GamePage() {
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#202020",
      }}
    >
      <Board />
    </div>
  );
}

export default GamePage;