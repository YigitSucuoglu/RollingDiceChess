import type { PlayerId } from "../contracts/PlayerIdentity";
import type {
  SingleMatchAchievementSnapshot,
} from "./AchievementContracts";
import type { GameResultReason, PieceColor, PieceType } from "../../types/Chess";

export interface SingleMatchMoveEvent {
  readonly eventId: number;
  readonly pieceId: string;
  readonly color: PieceColor;
  readonly pieceType: PieceType;
  readonly isCapture: boolean;
  readonly isPromotion: boolean;
}

export interface SingleMatchTurnEndedEvent {
  readonly eventId: number;
  readonly color: PieceColor;
  readonly movesUsed: number;
  readonly reason: "moves-exhausted" | "skipped";
}

export interface SingleMatchCompletedEvent {
  readonly eventId: number;
  readonly winner: PieceColor;
  readonly reason: GameResultReason;
  readonly finalPieceCounts: Readonly<Record<PieceColor, number>>;
}

export interface SingleMatchAchievementTrackerConfiguration {
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly playerColor: PieceColor;
}

export default class SingleMatchAchievementTracker {
  private readonly configuration: SingleMatchAchievementTrackerConfiguration;
  private readonly moveEventIds = new Set<number>();
  private readonly rollEventIds = new Set<number>();
  private readonly turnEventIds = new Set<number>();
  private readonly promotedPawnIds = new Set<string>();
  private playerSuccessfulMoves = 0;
  private botSuccessfulMoves = 0;
  private capturedEnemyPieces = 0;
  private capturedOwnPieces = 0;
  private pawnCaptures = 0;
  private tripleRouletteResults = 0;
  private currentConsecutiveThreeRightsTurns = 0;
  private bestConsecutiveThreeRightsTurns = 0;
  private currentPlayerTurnMoves = 0;
  private snapshot: SingleMatchAchievementSnapshot | null = null;
  private closed = false;

  public constructor(configuration: SingleMatchAchievementTrackerConfiguration) {
    this.configuration = configuration;
  }

  public recordRoll(color: PieceColor, roll: readonly PieceType[], eventId: number): void {
    if (this.closed || this.rollEventIds.has(eventId)) return;
    this.rollEventIds.add(eventId);
    if (color !== this.configuration.playerColor || roll.length !== 3) return;
    if (roll.every((piece) => piece === roll[0])) this.tripleRouletteResults++;
  }

  public recordMove(event: SingleMatchMoveEvent): void {
    if (this.closed || this.moveEventIds.has(event.eventId)) return;
    this.moveEventIds.add(event.eventId);
    const isPlayer = event.color === this.configuration.playerColor;
    if (isPlayer) {
      this.playerSuccessfulMoves++;
      this.currentPlayerTurnMoves++;
      if (event.isCapture) {
        this.capturedEnemyPieces++;
        if (event.pieceType === "pawn") this.pawnCaptures++;
      }
      if (event.isPromotion && event.pieceType === "pawn") {
        this.promotedPawnIds.add(event.pieceId);
      }
    } else {
      this.botSuccessfulMoves++;
      if (event.isCapture) this.capturedOwnPieces++;
    }
  }

  public recordTurnEnded(event: SingleMatchTurnEndedEvent): void {
    if (this.closed || this.turnEventIds.has(event.eventId)) return;
    this.turnEventIds.add(event.eventId);
    if (event.color !== this.configuration.playerColor) return;
    if (event.movesUsed === 3) {
      this.currentConsecutiveThreeRightsTurns++;
      this.bestConsecutiveThreeRightsTurns = Math.max(
        this.bestConsecutiveThreeRightsTurns,
        this.currentConsecutiveThreeRightsTurns,
      );
    } else {
      this.currentConsecutiveThreeRightsTurns = 0;
    }
    this.currentPlayerTurnMoves = 0;
  }

  public complete(event: SingleMatchCompletedEvent): SingleMatchAchievementSnapshot {
    if (this.snapshot) return this.snapshot;
    if (this.closed) throw new Error("Single-match achievement tracker is closed.");
    this.closed = true;
    const totalSuccessfulMoves = this.playerSuccessfulMoves + this.botSuccessfulMoves;
    this.snapshot = Object.freeze({
      matchId: this.configuration.matchId,
      mode: "singleplayer",
      playerId: this.configuration.playerId,
      playerColor: this.configuration.playerColor,
      status: "completed",
      terminationReason: event.reason,
      winner: event.winner,
      valid: true,
      playerSuccessfulMoves: this.playerSuccessfulMoves,
      botSuccessfulMoves: this.botSuccessfulMoves,
      totalSuccessfulMoves,
      promotedPawnIds: Object.freeze([...this.promotedPawnIds]),
      capturedEnemyPieces: this.capturedEnemyPieces,
      capturedOwnPieces: this.capturedOwnPieces,
      pawnCaptures: this.pawnCaptures,
      tripleRouletteResults: this.tripleRouletteResults,
      currentConsecutiveThreeRightsTurns: this.currentConsecutiveThreeRightsTurns,
      bestConsecutiveThreeRightsTurns: this.bestConsecutiveThreeRightsTurns,
      terminalPlayerTurnMovesUsed: this.currentPlayerTurnMoves,
      finalOwnPieceCount: event.finalPieceCounts[this.configuration.playerColor],
      complete: true,
    });
    return this.snapshot;
  }

  public abort(): void {
    if (this.closed) return;
    this.closed = true;
  }

  public getSnapshot(): SingleMatchAchievementSnapshot | null {
    return this.snapshot;
  }
}
