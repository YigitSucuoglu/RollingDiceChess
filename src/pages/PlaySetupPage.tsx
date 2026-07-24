import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DEFAULT_TIME_CONTROL,
  TIME_CONTROL_CATEGORIES,
  TIME_CONTROL_OPTIONS,
} from "../config/gameSetup";
import gameManager from "../engine/GameManager";
import {
  DEFAULT_PIECE_THEME,
  SELECTABLE_PIECE_THEMES,
} from "../config/pieceThemes";
import {
  DEFAULT_BOARD_THEME,
  SELECTABLE_BOARD_THEMES,
} from "../config/boardThemes";
import type { PieceColor } from "../types/Chess";
import type { BotDifficulty, GameSetup } from "../types/GameSetup";
import type { BoardTheme } from "../types/BoardTheme";
import type { PieceTheme } from "../types/PieceTheme";
import "../styles/PlaySetupPage.css";

const BOT_DIFFICULTY_OPTIONS: readonly {
  value: BotDifficulty;
  label: string;
  description: string;
}[] = [
  { value: "easy", label: "Easy", description: "Random legal moves" },
  {
    value: "medium",
    label: "Medium",
    description: "Tactical move choices",
  },
  { value: "hard", label: "Hard", description: "Plans the full turn" },
];

function ComingSoon() {
  return <span className="coming-soon">Coming soon</span>;
}

function PlaySetupPage() {
  const navigate = useNavigate();
  const [timeControlId, setTimeControlId] = useState(DEFAULT_TIME_CONTROL.id);
  const [playerColor, setPlayerColor] = useState<PieceColor>("white");
  const [botDifficulty, setBotDifficulty] =
    useState<BotDifficulty>("medium");
  const [pieceTheme, setPieceTheme] =
    useState<PieceTheme>(DEFAULT_PIECE_THEME);
  const [boardTheme, setBoardTheme] =
    useState<BoardTheme>(DEFAULT_BOARD_THEME);

  const startGame = () => {
    const timeControl = TIME_CONTROL_OPTIONS.find(
      (option) => option.id === timeControlId
    );

    if (!timeControl) {
      return;
    }

    const setup: GameSetup = {
      timeControl,
      playerColor,
      botColor: playerColor === "white" ? "black" : "white",
      opponentType: "bot",
      pieceTheme,
      boardTheme,
      botDifficulty,
    };

    gameManager.newGame(setup);
    navigate("/game");
  };

  return (
    <main className="play-setup-page">
      <div className="play-setup-shell">
        <header className="play-setup-header">
          <p>RollingDiceChess</p>
          <h1>Play Setup</h1>
        </header>

        <div className="play-setup-grid">
          <section aria-labelledby="time-control-heading" className="setup-card time-control-card">
            <h2 id="time-control-heading">Time Control</h2>

            <div className="time-control-groups">
              {TIME_CONTROL_CATEGORIES.map((category) => (
                <fieldset className="time-control-group" key={category}>
                  <legend>{category}</legend>

                  <div className="setup-options time-options">
                    {TIME_CONTROL_OPTIONS.filter(
                      (option) => option.category === category
                    ).map((option) => (
                      <label className="setup-radio" key={option.id}>
                        <input
                          checked={timeControlId === option.id}
                          name="time-control"
                          onChange={() => setTimeControlId(option.id)}
                          type="radio"
                          value={option.id}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          <div className="setup-card setup-secondary">
            <fieldset className="setup-section">
              <legend>Play As</legend>
              <div className="setup-options two-options">
                {(["white", "black"] as const).map((color) => (
                  <label className="setup-radio" key={color}>
                    <input
                      checked={playerColor === color}
                      name="player-color"
                      onChange={() => setPlayerColor(color)}
                      type="radio"
                      value={color}
                    />
                    <span>{color}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <section aria-labelledby="opponent-heading" className="setup-section">
              <h2 id="opponent-heading">Opponent</h2>
              <div className="setup-options three-options">
                <button aria-pressed="true" className="setup-choice selected" type="button">Bot</button>
                <button className="setup-choice" disabled type="button">Local<ComingSoon /></button>
                <button className="setup-choice" disabled type="button">Online<ComingSoon /></button>
              </div>
            </section>

            <fieldset className="setup-section">
              <legend>Bot Difficulty</legend>
              <div className="setup-options difficulty-options">
                {BOT_DIFFICULTY_OPTIONS.map((option) => (
                  <label
                    className="setup-radio difficulty-option"
                    key={option.value}
                  >
                    <input
                      checked={botDifficulty === option.value}
                      name="bot-difficulty"
                      onChange={() => setBotDifficulty(option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <span className="difficulty-card">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                      <span aria-hidden="true" className="difficulty-selected">
                        Selected
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <section aria-labelledby="piece-theme-heading" className="setup-section">
              <h2 id="piece-theme-heading">Piece Theme</h2>
              <div className="setup-options two-options">
                {SELECTABLE_PIECE_THEMES.map((theme) => (
                  <button
                    aria-pressed={pieceTheme === theme.id}
                    className={`setup-choice ${
                      pieceTheme === theme.id ? "selected" : ""
                    }`}
                    key={theme.id}
                    onClick={() => setPieceTheme(theme.id)}
                    type="button"
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="board-theme-heading" className="setup-section">
              <h2 id="board-theme-heading">Board Theme</h2>
              <div className="setup-options board-theme-options">
                {SELECTABLE_BOARD_THEMES.map((theme) => (
                  <button
                    aria-pressed={boardTheme === theme.id}
                    className={`setup-choice board-theme-choice ${
                      boardTheme === theme.id ? "selected" : ""
                    }`}
                    key={theme.id}
                    onClick={() => setBoardTheme(theme.id)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="board-theme-preview"
                      style={theme.style}
                    >
                      <i />
                      <i />
                    </span>
                    {theme.label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="play-setup-actions">
          <button className="setup-action primary" onClick={startGame} type="button">Start Game</button>
          <button className="setup-action secondary" onClick={() => navigate("/")} type="button">Back</button>
        </div>
      </div>
    </main>
  );
}

export default PlaySetupPage;
