import ChessBoard from "../../engine/ChessBoard";
import DiceEngine from "../../engine/DiceEngine";
import NotationGenerator from "../../engine/NotationGenerator";
import { applySimulatedMove } from "../../engine/Simulation";
import TurnResolver from "../../engine/TurnResolver";
import TurnRights from "../../engine/TurnRights";
import type { MatchHistoryEntry, MatchPieceSnapshot, MatchTurnHistory } from "../../domain/contracts/MatchContracts";
import type { Move, PieceColor, PieceType, Position } from "../../types/Chess";

export const AUTHORITATIVE_STATE_VERSION = 1;

export interface AuthoritativeStoredState {
  readonly schemaVersion: typeof AUTHORITATIVE_STATE_VERSION;
  readonly board: readonly (readonly (MatchPieceSnapshot | null)[])[];
  readonly currentTurn: PieceColor;
  readonly currentRoll: readonly [PieceType, PieceType, PieceType];
  readonly remainingRights: Readonly<Record<PieceType, number>>;
  readonly lastMove: Move | null;
  readonly winner: PieceColor | null;
  readonly moveHistory: readonly MatchTurnHistory[];
  readonly historySequence: number;
}

export interface AuthoritativeMoveResult {
  readonly state: AuthoritativeStoredState;
  readonly turnCompleted: boolean;
  readonly terminal: boolean;
}

const notation = new NotationGenerator();

type MutableTurnHistory = {
  turnNumber: number;
  whiteMoves: MatchHistoryEntry[];
  blackMoves: MatchHistoryEntry[];
};

function copyMove(move: Move | null): Move | null {
  return move ? { ...move, from: { ...move.from }, to: { ...move.to } } : null;
}

function createBoard(board: AuthoritativeStoredState["board"]): ChessBoard {
  const result = new ChessBoard();
  if (board.length !== 8 || board.some((row) => row.length !== 8)) {
    throw new Error("Canonical board dimensions are invalid.");
  }
  result.squares = board.map((row) => row.map((piece) => piece ? {
    ...piece,
    initialPosition: { ...piece.initialPosition },
  } : null));
  return result;
}

function createRights(snapshot: AuthoritativeStoredState["remainingRights"]): TurnRights {
  const rights = new TurnRights();
  for (const type of ["pawn", "knight", "bishop", "rook", "queen", "king"] as const) {
    const count = snapshot[type];
    if (!Number.isSafeInteger(count) || count < 0 || count > 3) {
      throw new Error("Canonical turn rights are invalid.");
    }
    rights.set(type, count);
  }
  return rights;
}

function rollRights(roll: readonly PieceType[]): Readonly<Record<PieceType, number>> {
  const rights = new TurnRights();
  for (const type of roll) rights.set(type, rights.get(type) + 1);
  return rights.getSnapshot();
}

function cloneHistory(history: readonly MatchTurnHistory[]): MutableTurnHistory[] {
  return history.map((turn) => ({
    turnNumber: turn.turnNumber,
    whiteMoves: turn.whiteMoves.map((entry) => ({ ...entry, from: { ...entry.from }, to: { ...entry.to } })),
    blackMoves: turn.blackMoves.map((entry) => ({ ...entry, from: { ...entry.from }, to: { ...entry.to } })),
  }));
}

function appendHistory(
  history: readonly MatchTurnHistory[],
  move: Move,
  player: PieceColor,
  piece: PieceType,
  sequence: number,
): MutableTurnHistory[] {
  const result = cloneHistory(history);
  const turnNumber = Math.max(1, result.length);
  let turn = result.find((entry) => entry.turnNumber === turnNumber);
  if (!turn) {
    turn = { turnNumber, whiteMoves: [], blackMoves: [] };
    result.push(turn);
  }
  const moves = player === "white" ? turn.whiteMoves : turn.blackMoves;
  const entry: MatchHistoryEntry = {
    turnNumber,
    player,
    moveIndex: moves.length + 1,
    notation: notation.generate(move, piece),
    piece,
    from: { ...move.from },
    to: { ...move.to },
    capture: move.isCapture,
    promotion: move.isPromotion,
    castle: move.isCastle,
    enPassant: move.isEnPassant,
    timestamp: sequence,
  };
  moves.push(entry);
  return result;
}

export function createAuthoritativeInitialState(random: () => number): AuthoritativeStoredState {
  const board = new ChessBoard();
  const roll = new DiceEngine(random).roll();
  return {
    schemaVersion: AUTHORITATIVE_STATE_VERSION,
    board: board.squares,
    currentTurn: "white",
    currentRoll: roll,
    remainingRights: rollRights(roll),
    lastMove: null,
    winner: null,
    moveHistory: [{ turnNumber: 1, whiteMoves: [], blackMoves: [] }],
    historySequence: 0,
  };
}

export function getAuthoritativeSelectableMoves(state: AuthoritativeStoredState): readonly Move[] {
  return new TurnResolver().resolve({
    board: createBoard(state.board),
    rights: createRights(state.remainingRights),
    currentTurn: state.currentTurn,
    lastMove: copyMove(state.lastMove),
    winner: state.winner,
  }).selectableMoves;
}

export function applyAuthoritativeMove(
  state: AuthoritativeStoredState,
  from: Readonly<Position>,
  to: Readonly<Position>,
  random: () => number,
): AuthoritativeMoveResult {
  if (state.winner) throw new Error("Match is already terminal.");
  const selected = getAuthoritativeSelectableMoves(state).find((move) =>
    move.from.row === from.row && move.from.col === from.col
      && move.to.row === to.row && move.to.col === to.col);
  if (!selected) throw new Error("Move is not legal in the canonical state.");
  const board = createBoard(state.board);
  const movedPiece = board.squares[from.row]?.[from.col];
  if (!movedPiece || movedPiece.color !== state.currentTurn) {
    throw new Error("Move source is not owned by the active player.");
  }
  const continued = applySimulatedMove({
    board,
    rights: createRights(state.remainingRights),
    currentTurn: state.currentTurn,
    lastMove: copyMove(state.lastMove),
    winner: state.winner,
  }, selected);
  continued.rights.consume(movedPiece.type);
  const historySequence = state.historySequence + 1;
  let moveHistory = appendHistory(state.moveHistory, selected, state.currentTurn, movedPiece.type, historySequence);
  if (continued.winner) {
    return { state: {
      schemaVersion: AUTHORITATIVE_STATE_VERSION,
      board: continued.board.squares,
      currentTurn: state.currentTurn,
      currentRoll: state.currentRoll,
      remainingRights: continued.rights.getSnapshot(),
      lastMove: copyMove(selected),
      winner: continued.winner,
      moveHistory,
      historySequence,
    }, turnCompleted: false, terminal: true };
  }
  const nextResolution = new TurnResolver().resolve(continued);
  if (nextResolution.maxConsumableRights > 0) {
    return { state: {
      schemaVersion: AUTHORITATIVE_STATE_VERSION,
      board: continued.board.squares,
      currentTurn: state.currentTurn,
      currentRoll: state.currentRoll,
      remainingRights: continued.rights.getSnapshot(),
      lastMove: copyMove(selected),
      winner: null,
      moveHistory,
      historySequence,
    }, turnCompleted: false, terminal: false };
  }
  const nextTurn = state.currentTurn === "white" ? "black" : "white";
  if (nextTurn === "white") {
    moveHistory = [...moveHistory, { turnNumber: moveHistory.length + 1, whiteMoves: [], blackMoves: [] }];
  }
  const roll = new DiceEngine(random).roll();
  return { state: {
    schemaVersion: AUTHORITATIVE_STATE_VERSION,
    board: continued.board.squares,
    currentTurn: nextTurn,
    currentRoll: roll,
    remainingRights: rollRights(roll),
    lastMove: copyMove(selected),
    winner: null,
    moveHistory,
    historySequence,
  }, turnCompleted: true, terminal: false };
}

export function advanceAuthoritativeUnplayableTurn(
  state: AuthoritativeStoredState,
  random: () => number,
): AuthoritativeStoredState {
  if (getAuthoritativeSelectableMoves(state).length > 0) {
    throw new Error("The canonical turn has playable moves.");
  }
  const nextTurn = state.currentTurn === "white" ? "black" : "white";
  const roll = new DiceEngine(random).roll();
  const history = cloneHistory(state.moveHistory);
  if (nextTurn === "white") history.push({ turnNumber: history.length + 1, whiteMoves: [], blackMoves: [] });
  return {
    ...state,
    currentTurn: nextTurn,
    currentRoll: roll,
    remainingRights: rollRights(roll),
    moveHistory: history,
  };
}
