import "./Board.css";
import gameManager from "../../bootstrap/GameManager";
import Piece from "../Piece/Piece";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { PieceType } from "../../types/Chess";
import { SLOT_MACHINE_ASSETS } from "../../assets/slot-machine";
import SlotReel from "../SlotReel/SlotReel";
import GameResultModal from "../GameResultModal/GameResultModal";
import MoveHistoryPanel from "../MoveHistory/MoveHistoryPanel";
import ChessClockPanel from "../ChessClock/ChessClockPanel";
import type { MatchConfiguration, MatchSession, MatchSnapshot } from "../../domain/contracts/MatchContracts";
import { BOARD_THEME_CATALOG } from "../../config/boardThemes";
import { ROLL_TIMING } from "../../config/rollTiming";
import soundManager from "../../services/SoundManager";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MatchExitDialog from "../MatchExitDialog/MatchExitDialog";
import type { OnlineMatchPresentation } from "../../application/matches/OnlineMatchSession";
import {
  markCanonicalBoardRendered,
  markMoveConfirmation,
} from "../../infrastructure/multiplayer/MultiplayerLatencyDiagnostics";

const HISTORY_TRANSITION_MS = 260;

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

type LeverAnimationStyle = CSSProperties & {
  "--lever-animation-duration": string;
};

type RenderableMatchSession = MatchSession & { readonly configuration: MatchConfiguration };

interface BoardProps {
  readonly onlinePresentation?: OnlineMatchPresentation;
  readonly sessionOverride?: RenderableMatchSession;
}

function Board({ onlinePresentation, sessionOverride }: BoardProps) {
  const session = sessionOverride ?? gameManager.getSession();
  const isOnline = session.configuration.mode === "online";
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [, setRefresh] = useState(0);
  const [matchSnapshot, setMatchSnapshot] = useState<MatchSnapshot>(() =>
    session.getSnapshot()
  );
  const [isMoveHistoryOpen, setIsMoveHistoryOpen] = useState(false);
  const [isMoveHistoryMounted, setIsMoveHistoryMounted] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(
    soundManager.isEnabled()
  );
  const historyCloseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOnline) markCanonicalBoardRendered();
  }, [isOnline, matchSnapshot.board]);
  const historyOpenRef = useRef(false);
  const historyOpenFrameRef = useRef<number | null>(null);
  const rollSoundRef = useRef({ session, spinning: 0, resolved: 0 });
  const playerActionInFlightRef = useRef(false);
  const lastSoundedMoveRef = useRef({ session, timestamp: 0 });
  const resultSoundGameRef = useRef<object | null>(null);
  const lastSkipSoundSequenceRef = useRef(0);
  const historyGuardInstalledRef = useRef(false);
  const historyGuardCollapsedRef = useRef(false);
  const allowHistoryExitRef = useRef(false);
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const rollPhase = matchSnapshot.roll.phase;
  const isInputLocked = !matchSnapshot.capabilities.canSelect;
  const moveHistory = matchSnapshot.moveHistory;
  const boardTheme = BOARD_THEME_CATALOG[session.configuration.boardTheme];

  useEffect(
    () => session.subscribe(setMatchSnapshot),
    [session]
  );

  useEffect(() => {
    window.history.replaceState(
      { ...window.history.state, rouletteChessMatchEntry: true },
      "",
      window.location.href,
    );
    window.history.pushState(
      { ...window.history.state, rouletteChessMatchGuard: true },
      "",
      window.location.href,
    );
    historyGuardInstalledRef.current = true;
    const handlePopState = () => {
      if (allowHistoryExitRef.current || session.getSnapshot().lifecycle !== "active") return;
      window.history.forward();
      void session.requestAction({ schemaVersion: 1, type: "OPEN_EXIT_CONFIRMATION" });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [session]);

  useEffect(() => {
    if (
      isOnline ||
      matchSnapshot.lifecycle !== "completed" ||
      historyGuardCollapsedRef.current ||
      !historyGuardInstalledRef.current ||
      !window.history.state?.rouletteChessMatchGuard
    ) return;
    historyGuardCollapsedRef.current = true;
    allowHistoryExitRef.current = true;
    window.addEventListener("popstate", () => {
      historyGuardInstalledRef.current = false;
      allowHistoryExitRef.current = false;
    }, { once: true });
    window.history.back();
  }, [isOnline, matchSnapshot.lifecycle]);

  useEffect(
    () => () => soundManager.stopAll(),
    [session]
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
    if (lastSoundedMoveRef.current.session !== session) {
      lastSoundedMoveRef.current = { session, timestamp: 0 };
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
  }, [session, moveHistory]);

  useEffect(() => {
    if (!matchSnapshot.winner || resultSoundGameRef.current === session) {
      return;
    }

    resultSoundGameRef.current = session;
    soundManager.stop("reel-spin");

    if (matchSnapshot.resultReason === "timeout") {
      soundManager.play("timeout");
    } else if (matchSnapshot.winner === session.configuration.playerColor) {
      soundManager.play("victory");
    } else {
      soundManager.play("defeat");
    }
  }, [matchSnapshot.resultReason, matchSnapshot.winner, session]);

  useEffect(() => {
    if (rollSoundRef.current.session !== session) {
      rollSoundRef.current = { session, spinning: 0, resolved: 0 };
    }
    const { phase, sequence, trigger } = matchSnapshot.roll;
    if (phase === "spinning" && rollSoundRef.current.spinning !== sequence) {
      rollSoundRef.current.spinning = sequence;
      if (trigger === "manual") soundManager.play("roll-button");
      soundManager.play("lever-pull");
      soundManager.play("reel-spin");
    }
    if (phase === "resolved" && rollSoundRef.current.resolved !== sequence) {
      rollSoundRef.current.resolved = sequence;
      soundManager.stop("reel-spin");
      soundManager.play("reel-stop");
    }
  }, [session, matchSnapshot.roll]);

  useEffect(() => {
    if (
      matchSnapshot.skip.phase === "message" &&
      lastSkipSoundSequenceRef.current !== matchSnapshot.skip.sequence
    ) {
      lastSkipSoundSequenceRef.current = matchSnapshot.skip.sequence;
      soundManager.play("turn-skipped");
    }
  }, [matchSnapshot.skip.phase, matchSnapshot.skip.sequence]);

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
    soundManager.stopAll();
    if (isOnline) {
      session.dispose();
      navigate("/multiplayer", { replace: true });
      return;
    }
    gameManager.restartGame();
    const newSession = gameManager.getSession();

    resetMoveHistory();
    setMatchSnapshot(newSession.getSnapshot());
    setRefresh((value) => value + 1);
  };

  const returnToMainMenu = () => {
    soundManager.stopAll();
    if (isOnline) {
      session.dispose();
      navigate("/multiplayer", { replace: true });
      return;
    }
    gameManager.newGame();
    navigate("/");
  };

  const openExitConfirmation = () => {
    void session.requestAction({ schemaVersion: 1, type: "OPEN_EXIT_CONFIRMATION" });
  };

  const returnToGame = async () => {
    const result = await session.requestAction({
      schemaVersion: 1,
      type: "CANCEL_EXIT_CONFIRMATION",
    });
    if (result.accepted) exitButtonRef.current?.focus();
  };

  const leaveMatch = async () => {
    const result = await session.requestAction({ schemaVersion: 1, type: "ABANDON_MATCH" });
    if (!result.accepted) return;
    soundManager.stopAll();
    session.dispose();
    if (isOnline) {
      allowHistoryExitRef.current = true;
      navigate("/multiplayer", { replace: true });
      return;
    }
    if (historyGuardInstalledRef.current && window.history.state?.rouletteChessMatchGuard) {
      allowHistoryExitRef.current = true;
      window.addEventListener("popstate", () => {
        historyGuardInstalledRef.current = false;
        navigate(isOnline ? "/multiplayer" : "/play", { replace: true });
      }, { once: true });
      window.history.back();
      return;
    }
    navigate(isOnline ? "/multiplayer" : "/play", { replace: true });
  };

  const squares = [];
  const playerColor = session.configuration.playerColor;
  const opponentColor = playerColor === "white" ? "black" : "white";
  const displayIndexes =
    playerColor === "black"
      ? [...BOARD_INDEXES].reverse()
      : BOARD_INDEXES;

  for (let displayRow = 0; displayRow < 8; displayRow++) {
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      const row = displayIndexes[displayRow];
      const col = displayIndexes[displayCol];
      const piece = matchSnapshot.board[row][col];

      const isSelected =
        matchSnapshot.selectedSquare?.row === row &&
        matchSnapshot.selectedSquare?.col === col;

      const isPossibleMove = matchSnapshot.selectableMoves.some(
        (move) => move.to.row === row && move.to.col === col
      );

      const isLight = (row + col) % 2 === 0;
      const squareName = `${String.fromCharCode(97 + col)}${8 - row}`;
      const squarePiece = piece
        ? `${t(`common.colors.${piece.color}`)} ${t(`common.pieces.${piece.type}`)}`
        : t("game.emptySquare");

      squares.push(
        <div
          aria-label={t("game.squareLabel", { piece: squarePiece, square: squareName })}
          key={`${row}-${col}`}
          data-square={squareName}
          className={`square ${isLight ? "light" : "dark"} ${
            isSelected ? "selected" : ""
          }`}
          onClick={() => {
            if (isInputLocked || playerActionInFlightRef.current) {
              return;
            }

            const move = matchSnapshot.selectableMoves.find(
              (m) => m.to.row === row && m.to.col === col
            );
            const action = move
              ? {
                  schemaVersion: 1 as const,
                  type: "MAKE_MOVE" as const,
                  pieceId: move.pieceId,
                  from: { ...move.from },
                  to: { ...move.to },
                }
              : {
                  schemaVersion: 1 as const,
                  type: "SELECT_SQUARE" as const,
                  position: { row, col },
                };

            if (isOnline && move) markMoveConfirmation();
            playerActionInFlightRef.current = true;
            void session.requestAction(action)
              .then((result) => setMatchSnapshot(result.snapshot))
              .finally(() => {
                playerActionInFlightRef.current = false;
              });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.currentTarget.click();
            }
          }}
          role="button"
          tabIndex={isInputLocked ? -1 : 0}
        >
          {piece && <Piece piece={piece} pieceSet={session.configuration.pieceSet} />}

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
      className={`game-shell${isOnline ? " multiplayer-game-shell" : ""}`}
      data-match-mode={session.configuration.mode}
      data-history-mounted={isMoveHistoryMounted}
      data-history-open={isMoveHistoryOpen}
    >
      <div className="game-layout">
      <div
        aria-hidden={matchSnapshot.winner || matchSnapshot.exitConfirmationOpen ? true : undefined}
        className="turn-panel"
        inert={matchSnapshot.exitConfirmationOpen ? true : undefined}
      >
        <div className="turn-header">
          <div className="turn-text">
            {t("game.toMove", { color: t(`common.colors.${matchSnapshot.currentPlayer}`) })}
          </div>

          <div className="game-toolbar">
            {matchSnapshot.lifecycle === "active" && (
              <button
                aria-label={t("game.exit.accessibleLabel")}
                className="game-toolbar-button game-exit-button"
                onClick={openExitConfirmation}
                ref={exitButtonRef}
                title={t("game.exit.accessibleLabel")}
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            )}
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

        {onlinePresentation ? (
          <div className="multiplayer-match-meta" aria-label={t("multiplayer.matchDetails")}>
            <span>{onlinePresentation.mode === "ranked" ? t("multiplayer.ranked") : t("multiplayer.unranked")}</span>
            <span>{onlinePresentation.white?.displayName} #{onlinePresentation.white?.publicDiscriminator}</span>
            <span>{onlinePresentation.black?.displayName} #{onlinePresentation.black?.publicDiscriminator}</span>
          </div>
        ) : null}

        <div className="roll-section">
              <div
                className="slot-machine-frame"
                data-roll-phase={rollPhase}
              >
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
                  {matchSnapshot.roll.visibleRoll.map((pieceType, index) => (
                    <SlotReel
                      key={`${matchSnapshot.roll.sequence}-${index}`}
                      isSpinning={rollPhase === "spinning"}
                      pieceColor={matchSnapshot.currentPlayer}
                      pieceSet={session.configuration.pieceSet}
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
                  className={`slot-machine-lever-layer${
                    rollPhase === "spinning" ? " is-pulling" : ""
                  }`}
                  style={
                    {
                      "--lever-animation-duration":
                        `${ROLL_TIMING.leverAnimationDurationMs}ms`,
                    } as LeverAnimationStyle
                  }
                >
                  <img
                    alt=""
                    className="slot-machine-lever"
                    src={SLOT_MACHINE_ASSETS.gameAssembly.lever}
                  />
                </span>
              </div>

              {!isOnline && <button
                className="roll-button"
                disabled={!matchSnapshot.roll.canStartManualRoll}
                onClick={() => {
                  void session.requestAction({
                    schemaVersion: 1,
                    type: "START_MANUAL_ROLL",
                  });
                }}
                type="button"
              >
                {t("common.actions.roll")}
              </button>}
        </div>
      </div>

      <ChessClockPanel
        color={opponentColor}
        isPlayer={false}
        rating={isOnline ? (opponentColor === "white"
          ? onlinePresentation?.white?.multiplayerRating
          : onlinePresentation?.black?.multiplayerRating) : undefined}
        roleLabel={isOnline ? (opponentColor === "white" ? onlinePresentation?.white?.displayName : onlinePresentation?.black?.displayName) : undefined}
        snapshot={matchSnapshot.clock}
      />

      <div
        aria-hidden={matchSnapshot.winner || matchSnapshot.exitConfirmationOpen ? true : undefined}
        className="board"
        data-board-theme={boardTheme.id}
        inert={matchSnapshot.exitConfirmationOpen ? true : undefined}
        style={boardTheme.style}
      >
        {squares}

        {matchSnapshot.skip.phase === "message" && (
          <div className="turn-skipped-message" role="status">
            {t("game.turnSkipped")}
          </div>
        )}
      </div>

      <ChessClockPanel
        color={playerColor}
        isPlayer
        rating={isOnline ? (playerColor === "white"
          ? onlinePresentation?.white?.multiplayerRating
          : onlinePresentation?.black?.multiplayerRating) : undefined}
        roleLabel={isOnline ? (playerColor === "white"
          ? onlinePresentation?.white?.displayName
          : onlinePresentation?.black?.displayName) : undefined}
        snapshot={matchSnapshot.clock}
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

      {matchSnapshot.winner && (
        <GameResultModal
          endReason={matchSnapshot.terminationReason ?? matchSnapshot.resultReason ?? "king-captured"}
          onMainMenu={returnToMainMenu}
          onPlayAgain={startNewGame}
          pieceSet={session.configuration.pieceSet}
          xpProgression={isOnline ? null : gameManager.getMatchXpProgression()!}
          ratingSettlement={isOnline && onlinePresentation?.mode === "ranked"
            ? onlinePresentation.ratingSettlement
            : null}
          winner={matchSnapshot.winner}
          showPlayAgain={!isOnline}
        />
      )}
      {isOnline && matchSnapshot.lifecycle === "completed" && !matchSnapshot.winner && (
        <div className="match-exit-overlay">
          <div aria-modal="true" className="match-exit-dialog" role="dialog">
            <p className="match-exit-eyebrow">RouletteChess</p>
            <h2>{t("multiplayer.technicalAbort")}</h2>
            <p>{t("multiplayer.technicalAbortDescription")}</p>
            <div className="match-exit-actions">
              <button className="match-exit-return" onClick={returnToMainMenu} type="button">
                {t("multiplayer.backToMultiplayer")}
              </button>
            </div>
          </div>
        </div>
      )}
      {matchSnapshot.exitConfirmationOpen && !matchSnapshot.winner && (
        <MatchExitDialog
          mode={isOnline
            ? onlinePresentation?.mode === "ranked" ? "multiplayer-ranked" : "multiplayer-unranked"
            : "singleplayer-bot"}
          onLeave={() => void leaveMatch()}
          onReturn={() => void returnToGame()}
        />
      )}
    </div>
  );
}

export default Board;
