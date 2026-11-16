import type {
  GameResultReason,
  PieceColor,
  PieceType,
} from "../types/Chess";

export interface GameMoveEvent {
  readonly eventId: number;
  readonly pieceId: string;
  readonly color: PieceColor;
  readonly pieceType: PieceType;
  readonly isCapture: boolean;
  readonly isPromotion: boolean;
}

export interface GameCompletedEvent {
  readonly eventId: number;
  readonly winner: PieceColor;
  readonly reason: GameResultReason;
  readonly finalPieceCounts: Readonly<Record<PieceColor, number>>;
}

export interface GameTurnEndedEvent {
  readonly eventId: number;
  readonly color: PieceColor;
  readonly movesUsed: number;
  readonly reason: "moves-exhausted" | "skipped";
}

export interface GameEventSink {
  onRoll(color: PieceColor, roll: readonly PieceType[], eventId: number): void;
  onMove(event: GameMoveEvent): void;
  onTurnCompleted(color: PieceColor, movesUsed: number): void;
  onTurnEnded(event: GameTurnEndedEvent): void;
  onGameCompleted(event: GameCompletedEvent): void;
}

export const NULL_GAME_EVENT_SINK: GameEventSink = {
  onRoll: () => undefined,
  onMove: () => undefined,
  onTurnCompleted: () => undefined,
  onTurnEnded: () => undefined,
  onGameCompleted: () => undefined,
};
