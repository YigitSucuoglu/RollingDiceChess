import type {
  GameResultReason,
  PieceColor,
  PieceType,
} from "../types/Chess";

export interface GameMoveEvent {
  readonly color: PieceColor;
  readonly pieceType: PieceType;
  readonly isCapture: boolean;
  readonly isPromotion: boolean;
}

export interface GameCompletedEvent {
  readonly winner: PieceColor;
  readonly reason: GameResultReason;
}

export interface GameEventSink {
  onRoll(color: PieceColor, roll: readonly PieceType[]): void;
  onMove(event: GameMoveEvent): void;
  onTurnCompleted(color: PieceColor, movesUsed: number): void;
  onGameCompleted(event: GameCompletedEvent): void;
}

export const NULL_GAME_EVENT_SINK: GameEventSink = {
  onRoll: () => undefined,
  onMove: () => undefined,
  onTurnCompleted: () => undefined,
  onGameCompleted: () => undefined,
};
