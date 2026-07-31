import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_TIME_CONTROL,
  TIME_CONTROL_CATEGORIES,
  TIME_CONTROL_OPTIONS,
} from "../config/gameSetup";
import gameManager from "../engine/GameManager";
import {
  DEFAULT_PIECE_SET,
  SELECTABLE_PIECE_SETS,
} from "../config/pieceSets";
import {
  DEFAULT_BOARD_THEME,
  SELECTABLE_BOARD_THEMES,
} from "../config/boardThemes";
import type { PieceColor } from "../types/Chess";
import type { BotDifficulty, GameSetup } from "../types/GameSetup";
import type { BoardTheme } from "../types/BoardTheme";
import type { PieceSet } from "../types/PieceSet";
import "../styles/PlaySetupPage.css";

const BOT_DIFFICULTY_OPTIONS: readonly {
  value: BotDifficulty;
}[] = [
  { value: "easy" }, { value: "medium" }, { value: "hard" },
];

function ComingSoon() {
  const { t } = useTranslation();
  return <span className="coming-soon">{t("common.status.comingSoon")}</span>;
}

function PlaySetupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [timeControlId, setTimeControlId] = useState(DEFAULT_TIME_CONTROL.id);
  const [playerColor, setPlayerColor] = useState<PieceColor>("white");
  const [botDifficulty, setBotDifficulty] =
    useState<BotDifficulty>("medium");
  const [pieceSet, setPieceSet] =
    useState<PieceSet>(DEFAULT_PIECE_SET);
  const [boardTheme, setBoardTheme] =
    useState<BoardTheme>(DEFAULT_BOARD_THEME);

  useEffect(() => { document.title = t("setup.browserTitle"); }, [t]);

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
      pieceSet,
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
          <p>RouletteChess</p>
          <h1>{t("setup.title")}</h1>
        </header>

        <div className="play-setup-grid">
          <section aria-labelledby="time-control-heading" className="setup-card time-control-card">
            <h2 id="time-control-heading">{t("setup.timeControl")}</h2>

            <div className="time-control-groups">
              {TIME_CONTROL_CATEGORIES.map((category) => (
                <fieldset className="time-control-group" key={category}>
                  <legend>{t(`common.timeCategories.${category.toLowerCase()}`)}</legend>

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
              <legend>{t("setup.playAs")}</legend>
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
                    <span>{t(`common.colors.${color}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <section aria-labelledby="opponent-heading" className="setup-section">
              <h2 id="opponent-heading">{t("setup.opponent")}</h2>
              <div className="setup-options three-options">
                <button aria-pressed="true" className="setup-choice selected" type="button">{t("setup.bot")}</button>
                <button className="setup-choice" disabled type="button">{t("setup.local")}<ComingSoon /></button>
                <button className="setup-choice" disabled type="button">{t("setup.online")}<ComingSoon /></button>
              </div>
            </section>

            <fieldset className="setup-section">
              <legend>{t("setup.difficulty")}</legend>
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
                      <strong>{t(`common.difficulties.${option.value}`)}</strong>
                      <small>{t(`setup.descriptions.${option.value}`)}</small>
                      <span aria-hidden="true" className="difficulty-selected">
                        {t("common.status.selected")}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <section aria-labelledby="piece-set-heading" className="setup-section">
              <h2 id="piece-set-heading">{t("setup.pieceSet")}</h2>
              <div className="setup-options three-options">
                {SELECTABLE_PIECE_SETS.map((set) => (
                  <button
                    aria-pressed={pieceSet === set.id}
                    className={`setup-choice ${
                      pieceSet === set.id ? "selected" : ""
                    }`}
                    key={set.id}
                    onClick={() => setPieceSet(set.id)}
                    type="button"
                  >
                    {t(`common.pieceSets.${set.id}`)}
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="board-theme-heading" className="setup-section">
              <h2 id="board-theme-heading">{t("setup.boardTheme")}</h2>
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
                    {t(`common.boardThemes.${theme.id}`)}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="play-setup-actions">
          <button className="setup-action primary" onClick={startGame} type="button">{t("common.actions.startGame")}</button>
          <button className="setup-action secondary" onClick={() => navigate("/")} type="button">{t("common.actions.back")}</button>
        </div>
      </div>
    </main>
  );
}

export default PlaySetupPage;
