import "./Board.css";
import gameManager from "../../engine/GameManager";
import Piece from "../Piece/Piece";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PieceType } from "../../types/Chess";
import { SLOT_MACHINE_ASSETS } from "../../assets/slot-machine";
import SlotReel from "../SlotReel/SlotReel";
import GameResultModal from "../GameResultModal/GameResultModal";
import MoveHistoryPanel from "../MoveHistory/MoveHistoryPanel";
import ChessClockPanel from "../ChessClock/ChessClockPanel";
import type { ChessClockSnapshot } from "../../engine/ChessClock";
import { BOARD_THEME_CATALOG } from "../../config/boardThemes";
import { useNavigate } from "react-router-dom";

const ROLLING_DURATION_MS = 1000;
const AUTOMATIC_ROLL_DELAY_MS = 500;
const UNPLAYABLE_ROLL_REVIEW_MS = 1200;
const TURN_SKIPPED_MESSAGE_MS = 1000;
const SLOT_STOP_TIMES_MS = [700, 850, ROLLING_DURATION_MS] as const;
const CLOCK_REFRESH_INTERVAL_MS = 250;
const LOW_TIME_CLOCK_REFRESH_INTERVAL_MS = 75;
const LOW_TIME_THRESHOLD_MS = 15_000;

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
const BOARD_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

function Board() {
  const game = gameManager.getGame();
  const navigate = useNavigate();

  const [, setRefresh] = useState(0);
  const [clockSnapshot, setClockSnapshot] = useState<ChessClockSnapshot>(() =>
    game.clock.getSnapshot()
  );
  const spinStartedForRollRef = useRef<readonly PieceType[] | null>(null);
  const botTurnInProgressRef = useRef(false);
  const botTurnAbortControllerRef = useRef<AbortController | null>(null);
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
    }, ROLLING_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [game.winner, rollAnimation.phase, rollAnimation.spinId]);

  const startRoll = useCallback(() => {
    if (
      game.winner !== null ||
      rollPhase !== "ready" ||
      spinStartedForRollRef.current === game.currentRoll
    ) {
      return;
    }

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
      (hasPlayableMoves && !game.isBotTurn()) ||
      rollPhase !== "ready"
    ) {
      return;
    }

    const timeoutId = window.setTimeout(startRoll, AUTOMATIC_ROLL_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [game, game.winner, hasPlayableMoves, rollPhase, startRoll]);

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

  const startNewGame = () => {
    botTurnAbortControllerRef.current?.abort();
    gameManager.newGame(game.setup);
    const newGame = gameManager.getGame();

    spinStartedForRollRef.current = null;
    botTurnInProgressRef.current = false;
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
          {piece && <Piece piece={piece} theme={game.setup.pieceTheme} />}

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
    <div className="game-shell">
      <div className="game-layout">
      <div
        aria-hidden={game.winner ? true : undefined}
        className="turn-panel"
      >
        <div className="turn-text">
          {game.currentTurn === "white" ? "White" : "Black"} to move
        </div>

        <div className="roll-section">
              <div className="slot-machine-frame">
                <img
                  alt=""
                  aria-hidden="true"
                  className={`slot-machine-lever ${
                    rollPhase === "spinning" ? "is-pulling" : ""
                  }`}
                  key={`lever-${rollAnimation.spinId}`}
                  src={SLOT_MACHINE_ASSETS.generated.lever}
                />

                <img
                  alt=""
                  aria-hidden="true"
                  className="slot-machine-frame-image"
                  src={SLOT_MACHINE_ASSETS.generated.frame}
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
                      pieceTheme={game.setup.pieceTheme}
                      reelIndex={index}
                      stopAfterMs={SLOT_STOP_TIMES_MS[index]}
                      targetPiece={pieceType}
                    />
                  ))}
                </div>
              </div>

              <button
                className="roll-button"
                disabled={
                  game.winner !== null ||
                  game.isBotTurn() ||
                  !hasPlayableMoves ||
                  rollPhase !== "ready"
                }
                onClick={startRoll}
                type="button"
              >
                ROLL
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
      </div>

      <ChessClockPanel
        color={playerColor}
        isPlayer
        snapshot={clockSnapshot}
      />

      {isTurnSkippedMessageVisible && (
        <div className="turn-skipped-message" role="status">
          No playable pieces — Turn skipped
        </div>
      )}
      </div>

      <div className="move-history-column">
        <MoveHistoryPanel history={moveHistory} />
      </div>

      {game.winner && (
        <GameResultModal
          endReason={game.resultReason ?? "king-captured"}
          onMainMenu={returnToMainMenu}
          onPlayAgain={startNewGame}
          pieceTheme={game.setup.pieceTheme}
          winner={game.winner}
        />
      )}
    </div>
  );
}

export default Board;
