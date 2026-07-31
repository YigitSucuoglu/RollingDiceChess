import "./Board.css";
import gameManager from "../../engine/GameManager";
import Piece from "../Piece/Piece";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PieceType } from "../../types/Chess";
import { SLOT_MACHINE_ASSETS } from "../../assets/slot-machine";
import SlotReel from "../SlotReel/SlotReel";
import GameResultModal from "../GameResultModal/GameResultModal";
import MoveHistoryPanel from "../MoveHistory/MoveHistoryPanel";
import ChessClockPanel from "../ChessClock/ChessClockPanel";
import type { ChessClockSnapshot } from "../../engine/ChessClock";
import { BOARD_THEME_CATALOG } from "../../config/boardThemes";
import { ROLL_TIMING } from "../../config/rollTiming";
import soundManager from "../../services/SoundManager";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const AUTOMATIC_ROLL_DELAY_MS = 500;
const UNPLAYABLE_ROLL_REVIEW_MS = 1200;
const TURN_SKIPPED_MESSAGE_MS = 1000;
const CLOCK_REFRESH_INTERVAL_MS = 250;
const LOW_TIME_CLOCK_REFRESH_INTERVAL_MS = 75;
const LOW_TIME_THRESHOLD_MS = 15_000;
const HISTORY_TRANSITION_MS = 260;

type RollPhase = "ready" | "spinning" | "resolved";

interface RollAnimationState {
  displayedRoll: readonly PieceType[];
  phase: RollPhase;
  roll: readonly PieceType[];
  spinId: number;
}

const INITIAL_REEL_DISPLAY: readonly PieceType[] = [
  "pawn",
  "knight",
  "bishop",
];
const GAME_REEL_SCALE_MULTIPLIERS: Readonly<Record<PieceType, number>> = {
  bishop: 1.2,
  king: 1.2,
  knight: 1.22,
  pawn: 1.12,
  queen: 1.22,
  rook: 1.18,
};
const GAME_REEL_TRANSLATE_X: Readonly<Partial<Record<PieceType, number>>> = {
  king: -0.01,
  knight: -0.02,
};
const GAME_REEL_TRANSLATE_Y: Readonly<Partial<Record<PieceType, number>>> = {
  king: 0.01,
};
const BOARD_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

function Board() {
  const game = gameManager.getGame();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [, setRefresh] = useState(0);
  const [isMoveHistoryOpen, setIsMoveHistoryOpen] = useState(false);
  const [isMoveHistoryMounted, setIsMoveHistoryMounted] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(
    soundManager.isEnabled()
  );
  const [clockSnapshot, setClockSnapshot] = useState<ChessClockSnapshot>(() =>
    game.clock.getSnapshot()
  );
  const historyCloseTimeoutRef = useRef<number | null>(null);
  const historyOpenRef = useRef(false);
  const historyOpenFrameRef = useRef<number | null>(null);
  const spinStartedForRollRef = useRef<readonly PieceType[] | null>(null);
  const botTurnInProgressRef = useRef(false);
  const botTurnAbortControllerRef = useRef<AbortController | null>(null);
  const lastSoundedMoveRef = useRef({ game, timestamp: 0 });
  const resultSoundGameRef = useRef<object | null>(null);
  const [isTurnSkippedMessageVisible, setIsTurnSkippedMessageVisible] =
    useState(false);
  const [rollAnimation, setRollAnimation] = useState<RollAnimationState>({
    displayedRoll: INITIAL_REEL_DISPLAY,
    phase: "ready",
    roll: game.currentRoll,
    spinId: 0,
  });

  if (rollAnimation.roll !== game.currentRoll) {
    setRollAnimation({
      displayedRoll: rollAnimation.displayedRoll,
      phase: "ready",
      roll: game.currentRoll,
      spinId: rollAnimation.spinId,
    });
  }

  const rollPhase =
    rollAnimation.roll === game.currentRoll ? rollAnimation.phase : "ready";
  const hasPlayableMoves = game.hasPlayableMoves();
  const isInputLocked =
    game.winner !== null ||
    game.isBotTurn() ||
    !hasPlayableMoves ||
    isTurnSkippedMessageVisible ||
    rollPhase !== "resolved";
  const moveHistory = game.moveHistory.getSnapshot();
  const boardTheme = BOARD_THEME_CATALOG[game.setup.boardTheme];

  useEffect(
    () => game.subscribe(() => setRefresh((value) => value + 1)),
    [game]
  );

  useEffect(
    () => () => soundManager.stopAll(),
    [game]
  );

  useEffect(
    () => soundManager.subscribe(setIsSoundEnabled),
    []
  );

  useEffect(
    () => () => {
      if (historyCloseTimeoutRef.current !== null) {
        window.clearTimeout(historyCloseTimeoutRef.current);
      }

      if (historyOpenFrameRef.current !== null) {
        window.cancelAnimationFrame(historyOpenFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (lastSoundedMoveRef.current.game !== game) {
      lastSoundedMoveRef.current = { game, timestamp: 0 };
    }

    const newMoves = moveHistory
      .flatMap((turn) => [...turn.whiteMoves, ...turn.blackMoves])
      .filter(
        (move) => move.timestamp > lastSoundedMoveRef.current.timestamp
      )
      .sort((first, second) => first.timestamp - second.timestamp);

    for (const move of newMoves) {
      soundManager.play(move.capture ? "capture" : "move");
      lastSoundedMoveRef.current.timestamp = move.timestamp;
    }
  }, [game, moveHistory]);

  useEffect(() => {
    if (!game.winner || resultSoundGameRef.current === game) {
      return;
    }

    resultSoundGameRef.current = game;
    soundManager.stop("reel-spin");

    if (game.resultReason === "timeout") {
      soundManager.play("timeout");
    } else if (game.winner === game.setup.playerColor) {
      soundManager.play("victory");
    } else {
      soundManager.play("defeat");
    }
  }, [game, game.resultReason, game.winner]);

  useEffect(() => {
    let isCancelled = false;
    let timeoutId: number | undefined;

    const refreshClock = () => {
      const snapshot = game.clock.getSnapshot();

      if (isCancelled) {
        return;
      }

      setClockSnapshot(snapshot);

      if (game.winner) {
        return;
      }

      const activeRemainingMs =
        snapshot.activeColor === "white"
          ? snapshot.whiteRemainingMs
          : snapshot.activeColor === "black"
            ? snapshot.blackRemainingMs
            : null;
      const refreshInterval =
        activeRemainingMs !== null &&
        activeRemainingMs <= LOW_TIME_THRESHOLD_MS
          ? LOW_TIME_CLOCK_REFRESH_INTERVAL_MS
          : CLOCK_REFRESH_INTERVAL_MS;

      timeoutId = window.setTimeout(refreshClock, refreshInterval);
    };

    refreshClock();

    return () => {
      isCancelled = true;

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [game]);

  useEffect(() => {
    if (rollAnimation.phase !== "spinning") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (game.winner) {
        return;
      }

      setRollAnimation((state) => ({ ...state, phase: "resolved" }));
      soundManager.stop("reel-spin");
      soundManager.play("reel-stop");
    }, ROLL_TIMING.durationMs);

    return () => {
      window.clearTimeout(timeoutId);
      soundManager.stop("reel-spin");
    };
  }, [game.winner, rollAnimation.phase, rollAnimation.spinId]);

  const startRoll = useCallback((withButtonFeedback = false) => {
    if (
      game.winner !== null ||
      rollPhase !== "ready" ||
      spinStartedForRollRef.current === game.currentRoll
    ) {
      return;
    }

    if (withButtonFeedback) {
      soundManager.play("roll-button");
    }

    soundManager.play("lever-pull");
    soundManager.play("reel-spin");
    spinStartedForRollRef.current = game.currentRoll;
    setRollAnimation((state) => ({
      ...state,
      displayedRoll: game.currentRoll,
      phase: "spinning",
      spinId: state.spinId + 1,
    }));
  }, [game, rollPhase, setRollAnimation]);

  useEffect(() => {
    if (
      game.winner ||
      !game.isBotTurn() ||
      rollPhase !== "ready"
    ) {
      return;
    }

    const timeoutId = window.setTimeout(startRoll, AUTOMATIC_ROLL_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [game, game.winner, rollPhase, startRoll]);

  useEffect(() => {
    if (game.winner || hasPlayableMoves || rollPhase !== "resolved") {
      return;
    }

    const turnRoll = game.currentRoll;
    let skipTimeoutId: number | undefined;
    const reviewTimeoutId = window.setTimeout(() => {
      if (game.winner || game.currentRoll !== turnRoll) {
        return;
      }

      soundManager.play("turn-skipped");
      setIsTurnSkippedMessageVisible(true);
      skipTimeoutId = window.setTimeout(() => {
        if (!game.winner && game.currentRoll === turnRoll) {
          game.skipUnplayableTurn();
        }

        setIsTurnSkippedMessageVisible(false);
        setRefresh((value) => value + 1);
      }, TURN_SKIPPED_MESSAGE_MS);
    }, UNPLAYABLE_ROLL_REVIEW_MS);

    return () => {
      window.clearTimeout(reviewTimeoutId);

      if (skipTimeoutId !== undefined) {
        window.clearTimeout(skipTimeoutId);
      }
    };
  }, [game, game.winner, hasPlayableMoves, rollPhase]);

  useEffect(() => {
    if (game.winner || !hasPlayableMoves || rollPhase !== "resolved") {
      return;
    }

    game.startClockForCurrentTurn();
  }, [game, game.winner, hasPlayableMoves, rollPhase]);

  useEffect(() => {
    if (
      game.winner ||
      !game.isBotTurn() ||
      !hasPlayableMoves ||
      rollPhase !== "resolved" ||
      botTurnInProgressRef.current
    ) {
      return;
    }

    botTurnInProgressRef.current = true;
    const abortController = new AbortController();
    botTurnAbortControllerRef.current = abortController;

    void game
      .playBotTurn(
        () => setRefresh((value) => value + 1),
        abortController.signal
      )
      .finally(() => {
        if (botTurnAbortControllerRef.current === abortController) {
          botTurnAbortControllerRef.current = null;
        }
        botTurnInProgressRef.current = false;
        setRefresh((value) => value + 1);
      });

    return () => abortController.abort();
  }, [game, game.winner, hasPlayableMoves, rollPhase]);

  const toggleMoveHistory = () => {
    if (historyCloseTimeoutRef.current !== null) {
      window.clearTimeout(historyCloseTimeoutRef.current);
      historyCloseTimeoutRef.current = null;
    }

    if (historyOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(historyOpenFrameRef.current);
      historyOpenFrameRef.current = null;
    }

    if (historyOpenRef.current) {
      historyOpenRef.current = false;
      setIsMoveHistoryOpen(false);
      historyCloseTimeoutRef.current = window.setTimeout(() => {
        setIsMoveHistoryMounted(false);
        historyCloseTimeoutRef.current = null;
      }, HISTORY_TRANSITION_MS);
      return;
    }

    historyOpenRef.current = true;
    setIsMoveHistoryMounted(true);
    historyOpenFrameRef.current = window.requestAnimationFrame(() => {
      setIsMoveHistoryOpen(true);
      historyOpenFrameRef.current = null;
    });
  };

  const resetMoveHistory = () => {
    if (historyCloseTimeoutRef.current !== null) {
      window.clearTimeout(historyCloseTimeoutRef.current);
      historyCloseTimeoutRef.current = null;
    }

    if (historyOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(historyOpenFrameRef.current);
      historyOpenFrameRef.current = null;
    }

    historyOpenRef.current = false;
    setIsMoveHistoryOpen(false);
    setIsMoveHistoryMounted(false);
  };

  const startNewGame = () => {
    botTurnAbortControllerRef.current?.abort();
    soundManager.stopAll();
    gameManager.newGame(game.setup);
    const newGame = gameManager.getGame();

    spinStartedForRollRef.current = null;
    botTurnInProgressRef.current = false;
    resetMoveHistory();
    setIsTurnSkippedMessageVisible(false);
    setClockSnapshot(newGame.clock.getSnapshot());
    setRollAnimation((state) => ({
      displayedRoll: INITIAL_REEL_DISPLAY,
      phase: "ready",
      roll: newGame.currentRoll,
      spinId: state.spinId + 1,
    }));
    setRefresh((value) => value + 1);
  };

  const returnToMainMenu = () => {
    botTurnAbortControllerRef.current?.abort();
    soundManager.stopAll();
    setIsTurnSkippedMessageVisible(false);
    gameManager.newGame();
    navigate("/");
  };

  const squares = [];
  const playerColor = game.setup.playerColor;
  const opponentColor = playerColor === "white" ? "black" : "white";
  const displayIndexes =
    playerColor === "black"
      ? [...BOARD_INDEXES].reverse()
      : BOARD_INDEXES;

  for (let displayRow = 0; displayRow < 8; displayRow++) {
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      const row = displayIndexes[displayRow];
      const col = displayIndexes[displayCol];
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
            if (isInputLocked) {
              return;
            }

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
          {piece && <Piece piece={piece} pieceSet={game.setup.pieceSet} />}

          {isPossibleMove && <div className="move-dot" />}

          {displayRow === 7 && (
            <span
              aria-hidden="true"
              className="board-coordinate file-coordinate"
            >
              {String.fromCharCode(97 + col)}
            </span>
          )}

          {displayCol === 0 && (
            <span
              aria-hidden="true"
              className="board-coordinate rank-coordinate"
            >
              {8 - row}
            </span>
          )}
        </div>
      );
    }
  }

  return (
    <div
      className="game-shell"
      data-history-mounted={isMoveHistoryMounted}
      data-history-open={isMoveHistoryOpen}
    >
      <div className="game-layout">
      <div
        aria-hidden={game.winner ? true : undefined}
        className="turn-panel"
      >
        <div className="turn-header">
          <div className="turn-text">
            {t("game.toMove", { color: t(`common.colors.${game.currentTurn}`) })}
          </div>

          <div className="game-toolbar">
            <button
              aria-label={t(isSoundEnabled ? "game.muteSound" : "game.enableSound")}
              aria-pressed={!isSoundEnabled}
              className="game-toolbar-button"
              onClick={() => soundManager.toggle()}
              title={t(isSoundEnabled ? "game.muteSound" : "game.enableSound")}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                {isSoundEnabled ? (
                  <path d="M16 8.2a5 5 0 0 1 0 7.6M18.5 5.7a8.5 8.5 0 0 1 0 12.6" />
                ) : (
                  <path d="m16.5 9 5 6m0-6-5 6" />
                )}
              </svg>
            </button>

            <button
              aria-controls="move-history-panel"
              aria-expanded={isMoveHistoryOpen}
              aria-label={
                isMoveHistoryOpen
                  ? t("game.closeHistory")
                  : t("game.openHistory")
              }
              aria-pressed={isMoveHistoryOpen}
              className="game-toolbar-button history-toggle"
              onClick={toggleMoveHistory}
              title={
                isMoveHistoryOpen
                  ? t("game.closeHistory")
                  : t("game.openHistory")
              }
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M7 6h13M7 12h13M7 18h13" />
                <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
              </svg>
            </button>
          </div>
        </div>

        <div className="roll-section">
              <div className="slot-machine-frame">
                <img
                  alt=""
                  aria-hidden="true"
                  className="slot-machine-frame-image"
                  src={SLOT_MACHINE_ASSETS.gameAssembly.machine}
                />

                <div
                  className={`roll-slots ${
                    rollPhase === "spinning" ? "rolling" : ""
                  }`}
                  aria-busy={rollPhase === "spinning"}
                >
                  {rollAnimation.displayedRoll.map((pieceType, index) => (
                    <SlotReel
                      key={`${rollAnimation.spinId}-${index}`}
                      isSpinning={rollPhase === "spinning"}
                      pieceColor={game.currentTurn}
                      pieceSet={game.setup.pieceSet}
                      reelIndex={index}
                      stopAfterMs={ROLL_TIMING.reelStopTimesMs[index]}
                      targetPiece={pieceType}
                      visualScaleByPiece={GAME_REEL_SCALE_MULTIPLIERS}
                      visualTranslateXByPiece={GAME_REEL_TRANSLATE_X}
                      visualTranslateYByPiece={GAME_REEL_TRANSLATE_Y}
                    />
                  ))}
                </div>

                <span
                  aria-hidden="true"
                  className="slot-machine-lever-layer"
                >
                  <img
                    alt=""
                    className="slot-machine-lever"
                    src={SLOT_MACHINE_ASSETS.gameAssembly.lever}
                  />
                </span>
              </div>

              <button
                className="roll-button"
                disabled={
                  game.winner !== null ||
                  game.isBotTurn() ||
                  rollPhase !== "ready"
                }
                onClick={() => startRoll(true)}
                type="button"
              >
                {t("common.actions.roll")}
              </button>
        </div>
      </div>

      <ChessClockPanel
        color={opponentColor}
        isPlayer={false}
        snapshot={clockSnapshot}
      />

      <div
        aria-hidden={game.winner ? true : undefined}
        className="board"
        data-board-theme={boardTheme.id}
        style={boardTheme.style}
      >
        {squares}

        {isTurnSkippedMessageVisible && (
          <div className="turn-skipped-message" role="status">
            {t("game.turnSkipped")}
          </div>
        )}
      </div>

      <ChessClockPanel
        color={playerColor}
        isPlayer
        snapshot={clockSnapshot}
      />

      </div>

      {isMoveHistoryMounted && (
        <div
          aria-hidden={!isMoveHistoryOpen}
          className="move-history-column"
          inert={!isMoveHistoryOpen}
        >
          <MoveHistoryPanel history={moveHistory} />
        </div>
      )}

      {game.winner && (
        <GameResultModal
          endReason={game.resultReason ?? "king-captured"}
          onMainMenu={returnToMainMenu}
          onPlayAgain={startNewGame}
          pieceSet={game.setup.pieceSet}
          xpProgression={gameManager.getMatchXpProgression(game)!}
          winner={game.winner}
        />
      )}
    </div>
  );
}

export default Board;
