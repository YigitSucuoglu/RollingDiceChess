import { useNavigate } from "react-router-dom";
import "../styles/HomePage.css";

function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home">
      <h1 className="title">🎲 RollingDiceChess</h1>

      <div className="menu">
        <button onClick={() => navigate("/game")}>Play</button>

        <button onClick={() => navigate("/profile")}>Profile</button>

        <button onClick={() => navigate("/settings")}>Settings</button>
      </div>

      <p className="version">v0.0.4</p>
    </div>
  );
}

export default HomePage;