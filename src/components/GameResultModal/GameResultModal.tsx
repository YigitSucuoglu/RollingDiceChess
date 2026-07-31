import { useEffect, useRef, type CSSProperties } from "react";
import type { KeyboardEvent } from "react";
import { resolvePieceVisual } from "../../config/pieceSets";
import type { GameResultReason, PieceColor } from "../../types/Chess";
import type { PieceSet } from "../../types/PieceSet";
import type { MatchXpProgressionResult } from "../../profile/ProfileProgression";
import ResultXpProgress from "./ResultXpProgress";
import "./GameResultModal.css";
import { useTranslation } from "react-i18next";

interface GameResultModalProps {
  endReason: GameResultReason;
  onMainMenu: () => void;
  onPlayAgain: () => void;
  pieceSet: PieceSet;
  xpProgression: MatchXpProgressionResult;
  winner: PieceColor;
}

type ResultPieceStyle = CSSProperties & {
  "--piece-scale": number;
  "--piece-translate-x": string;
  "--piece-translate-y": string;
};

function GameResultModal({
  endReason,
  onMainMenu,
  onPlayAgain,
  pieceSet,
  xpProgression,
  winner,
}: GameResultModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  const loser = winner === "white" ? "black" : "white";
  const endReasonLabel =
    endReason === "timeout" ? t("result.timeout", { color: t(`common.colors.${loser}`) }) : t("result.kingCaptured");
  const kingVisual = resolvePieceVisual({
    context: "result",
    pieceColor: winner,
    pieceType: "king",
    pieceSet,
  });

  useEffect(() => {
    playAgainRef.current?.focus();
  }, []);

  const keepFocusInDialog = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    const actions = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)"
    );

    if (!actions || actions.length === 0) {
      return;
    }

    const firstAction = actions[0];
    const lastAction = actions[actions.length - 1];

    if (event.shiftKey && document.activeElement === firstAction) {
      event.preventDefault();
      lastAction.focus();
    } else if (!event.shiftKey && document.activeElement === lastAction) {
      event.preventDefault();
      firstAction.focus();
    }
  };

  return (
    <div className="game-result-overlay">
      <div
        aria-describedby="game-result-reason"
        aria-labelledby="game-result-title"
        aria-modal="true"
        className="game-result-dialog"
        onKeyDown={keepFocusInDialog}
        ref={dialogRef}
        role="dialog"
      >
        <div className="game-result-eyebrow">{t("result.gameOver")}</div>

        {kingVisual.kind === "image" ? (
          <img
            alt={`${t(`common.colors.${winner}`)} ${t("common.pieces.king")}`}
            className="game-result-king"
            src={kingVisual.src}
            style={
              {
                "--piece-scale": kingVisual.scale,
                "--piece-translate-x": `${kingVisual.translateX * 100}%`,
                "--piece-translate-y": `${kingVisual.translateY * 100}%`,
              } as ResultPieceStyle
            }
          />
        ) : (
          <span className="game-result-king game-result-king-text">
            {kingVisual.value}
          </span>
        )}

        <h2 id="game-result-title">
          {t("result.wins", { color: t(`common.colors.${winner}`) })}
        </h2>

        <p id="game-result-reason">{endReasonLabel}</p>

        <ResultXpProgress progression={xpProgression} />

        <div className="game-result-actions">
          <button
            className="game-result-button primary"
            onClick={onPlayAgain}
            ref={playAgainRef}
            type="button"
          >
            {t("common.actions.playAgain")}
          </button>

          <button
            className="game-result-button secondary"
            onClick={onMainMenu}
            type="button"
          >
            {t("common.actions.mainMenu")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GameResultModal;
