import { describe, expect, it, vi } from "vitest";

import LocalBotMatchSession from "../../src/application/matches/LocalBotMatchSession";
import { createDefaultGameSetup } from "../../src/config/gameSetup";
import type { MatchActionResult } from "../../src/domain/contracts/MatchContracts";
import Game from "../../src/engine/Game";
import { toLocalBotMatchConfiguration } from "../../src/infrastructure/local/createLocalBotMatchSession";
import type { Move, Piece, PieceType } from "../../src/types/Chess";

function createSession(): LocalBotMatchSession {
  const setup = createDefaultGameSetup();
  const game = new Game(setup, undefined, undefined, {
    random: () => 0,
    timeSource: { now: () => 0 },
  });
  return new LocalBotMatchSession(game, toLocalBotMatchConfiguration(setup));
}

function piece(id: string, type: PieceType, color: "white" | "black", row: number, col: number, hasMoved = true): Piece {
  return { id, type, color, hasMoved, initialPosition: { row, col } };
}

async function select(session: LocalBotMatchSession, row: number, col: number): Promise<MatchActionResult> {
  return session.requestAction({ schemaVersion: 1, type: "SELECT_SQUARE", position: { row, col } });
}

async function move(session: LocalBotMatchSession, candidate: Move): Promise<MatchActionResult> {
  return session.requestAction({
    schemaVersion: 1,
    type: "MAKE_MOVE",
    pieceId: candidate.pieceId,
    from: candidate.from,
    to: candidate.to,
  });
}

describe("selection and move session boundary", () => {
  it("selects, changes, and clears selection without mutating old snapshots", async () => {
    const session = createSession();
    session.game.turnRights.set("pawn", 2);
    const before = session.getSnapshot();
    const listener = vi.fn();
    session.subscribe(listener);

    const first = await select(session, 6, 0);
    expect(first).toMatchObject({ accepted: true, snapshot: { selectedSquare: { row: 6, col: 0 } } });
    expect(first.snapshot.selectableMoves.length).toBeGreaterThan(0);
    expect(before.selectedSquare).toBeNull();

    const second = await select(session, 6, 1);
    expect(second).toMatchObject({ accepted: true, snapshot: { selectedSquare: { row: 6, col: 1 } } });
    const cleared = await session.requestAction({ schemaVersion: 1, type: "CLEAR_SELECTION" });
    expect(cleared).toMatchObject({ accepted: true, snapshot: { selectedSquare: null } });
    expect(listener).toHaveBeenCalledTimes(3);
    session.dispose();
  });

  it("rejects opponent, duplicate, illegal, disposed, and completed-state actions without publishing", async () => {
    const session = createSession();
    session.game.turnRights.set("pawn", 1);
    const listener = vi.fn();
    session.subscribe(listener);

    expect(await select(session, 1, 0)).toMatchObject({ accepted: false, reason: "invalid-action" });
    expect(listener).not.toHaveBeenCalled();
    expect((await select(session, 6, 0)).accepted).toBe(true);
    expect(await select(session, 6, 0)).toMatchObject({ accepted: false, reason: "invalid-action" });
    expect(await session.requestAction({
      schemaVersion: 1,
      type: "MAKE_MOVE",
      pieceId: "missing",
      from: { row: 6, col: 0 },
      to: { row: 3, col: 0 },
    })).toMatchObject({ accepted: false, reason: "illegal-move" });
    expect(listener).toHaveBeenCalledOnce();

    session.game.winner = "white";
    expect(await select(session, 6, 1)).toMatchObject({ accepted: false, reason: "invalid-action" });
    session.dispose();
    expect(await select(session, 6, 1)).toMatchObject({ accepted: false, reason: "session-disposed" });
  });

  it("commits a normal capture and updates immutable board/history snapshots once", async () => {
    const session = createSession();
    session.game.board.squares = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
    session.game.board.squares[4][4] = piece("rook", "rook", "white", 4, 4);
    session.game.board.squares[4][6] = piece("pawn", "pawn", "black", 4, 6);
    session.game.turnRights.set("rook", 1);
    const listener = vi.fn();
    session.subscribe(listener);
    const selected = await select(session, 4, 4);
    const beforeMove = selected.snapshot;
    const capture = selected.snapshot.selectableMoves.find((candidate) => candidate.to.col === 6)!;
    const result = await move(session, capture);

    expect(result.accepted).toBe(true);
    expect(result.snapshot.board[4][6]?.id).toBe("rook");
    expect(result.snapshot.moveHistory[0].whiteMoves[0]).toMatchObject({ capture: true, piece: "rook" });
    expect(beforeMove.board[4][4]?.id).toBe("rook");
    expect(listener).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("keeps independently constructed sessions isolated", async () => {
    const firstSession = createSession();
    const secondSession = createSession();
    firstSession.game.turnRights.set("pawn", 1);
    secondSession.game.turnRights.set("pawn", 1);

    const firstSelection = await select(firstSession, 6, 0);

    expect(firstSelection.accepted).toBe(true);
    expect(firstSession.getSnapshot().selectedSquare).toEqual({ row: 6, col: 0 });
    expect(secondSession.getSnapshot().selectedSquare).toBeNull();
    firstSession.dispose();
    secondSession.dispose();
  });
});

describe("special moves through MatchSession", () => {
  it("preserves castling", async () => {
    const session = createSession();
    session.game.board.squares = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
    session.game.board.squares[7][4] = piece("king", "king", "white", 7, 4, false);
    session.game.board.squares[7][7] = piece("rook", "rook", "white", 7, 7, false);
    session.game.turnRights.set("king", 1);
    const selected = await select(session, 7, 4);
    const castle = selected.snapshot.selectableMoves.find((candidate) => candidate.isCastle && candidate.to.col === 6)!;
    const result = await move(session, castle);
    expect(result.snapshot.board[7][6]?.type).toBe("king");
    expect(result.snapshot.board[7][5]?.type).toBe("rook");
    session.dispose();
  });

  it("preserves en passant", async () => {
    const session = createSession();
    session.game.board.squares = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
    session.game.board.squares[3][4] = piece("white-pawn", "pawn", "white", 3, 4);
    session.game.board.squares[3][5] = piece("black-pawn", "pawn", "black", 3, 5);
    session.game.lastMove = {
      pieceId: "black-pawn", from: { row: 1, col: 5 }, to: { row: 3, col: 5 },
      isCapture: false, isCastle: false, isPromotion: false, isEnPassant: false,
    };
    session.game.turnRights.set("pawn", 1);
    const selected = await select(session, 3, 4);
    const enPassant = selected.snapshot.selectableMoves.find((candidate) => candidate.isEnPassant)!;
    const result = await move(session, enPassant);
    expect(result.snapshot.board[2][5]?.id).toBe("white-pawn");
    expect(result.snapshot.board[3][5]).toBeNull();
    session.dispose();
  });

  it("preserves automatic queen promotion", async () => {
    const session = createSession();
    session.game.board.squares = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
    session.game.board.squares[1][0] = piece("pawn", "pawn", "white", 1, 0);
    session.game.turnRights.set("pawn", 1);
    const selected = await select(session, 1, 0);
    const promotion = selected.snapshot.selectableMoves.find((candidate) => candidate.to.row === 0)!;
    const result = await move(session, promotion);
    expect(result.snapshot.board[0][0]?.type).toBe("queen");
    session.dispose();
  });
});
