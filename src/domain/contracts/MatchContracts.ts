import type {
  GameResultReason,
  Move,
  Piece,
  PieceColor,
  PieceType,
  Position,
} from "../../types/Chess.js";
import type { BoardTheme } from "../../types/BoardTheme.js";
import type { BotDifficulty } from "../../types/GameSetup.js";
import type { PieceSet } from "../../types/PieceSet.js";

export const MATCH_CONFIGURATION_SCHEMA_VERSION = 1;
export const MATCH_SNAPSHOT_SCHEMA_VERSION = 1;
export const MATCH_ACTION_SCHEMA_VERSION = 1;

export type GameMode = "bot" | "online";
export type ConnectionState =
  | "local"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface MatchTimeControl {
  readonly id: string;
  readonly initialMs: number;
  readonly incrementMs: number;
}

interface MatchConfigurationBase {
  readonly schemaVersion: typeof MATCH_CONFIGURATION_SCHEMA_VERSION;
  readonly playerColor: PieceColor;
  readonly timeControl: MatchTimeControl;
  readonly pieceSet: PieceSet;
  readonly boardTheme: BoardTheme;
}

export interface LocalBotMatchConfiguration extends MatchConfigurationBase {
  readonly mode: "bot";
  readonly botColor: PieceColor;
  readonly botDifficulty: BotDifficulty;
}

export interface OnlineMatchConfiguration extends MatchConfigurationBase {
  readonly mode: "online";
  readonly authoritativeMatchId: string;
}

export type MatchConfiguration =
  | LocalBotMatchConfiguration
  | OnlineMatchConfiguration;

export interface MatchPieceSnapshot extends Piece {
  readonly initialPosition: Readonly<Position>;
}

export interface MatchClockSnapshot {
  readonly whiteRemainingMs: number;
  readonly blackRemainingMs: number;
  readonly activeColor: PieceColor | null;
  readonly isRunning: boolean;
  readonly timedOutColor: PieceColor | null;
  readonly incrementMs: number;
}

export interface MatchHistoryEntry {
  readonly turnNumber: number;
  readonly player: PieceColor;
  readonly moveIndex: number;
  readonly notation: string;
  readonly piece: PieceType;
  readonly from: Readonly<Position>;
  readonly to: Readonly<Position>;
  readonly capture: boolean;
  readonly promotion: boolean;
  readonly castle: boolean;
  readonly enPassant: boolean;
  readonly timestamp: number;
}

export interface MatchTurnHistory {
  readonly turnNumber: number;
  readonly whiteMoves: readonly MatchHistoryEntry[];
  readonly blackMoves: readonly MatchHistoryEntry[];
}

export type MatchRollPhase = "ready" | "spinning" | "resolved";
export type MatchLifecycle = "active" | "completed" | "abandoned";
export type MatchTerminationReason = GameResultReason | "abandoned" | "forfeit" | "disconnect-forfeit" | "technical-abort";

export interface MatchRollSnapshot {
  readonly phase: MatchRollPhase;
  readonly visibleRoll: readonly [PieceType, PieceType, PieceType];
  readonly sequence: number;
  readonly trigger: "manual" | "automatic" | null;
  readonly canStartManualRoll: boolean;
}

export type MatchController = "human" | "bot";
export type MatchSkipPhase = "none" | "reviewing" | "message";

export interface MatchSkipSnapshot {
  readonly phase: MatchSkipPhase;
  readonly sequence: number;
}

export interface MatchCapabilities {
  readonly canSelect: boolean;
  readonly canMove: boolean;
  readonly canStartManualRoll: boolean;
}

export interface MatchSnapshot {
  readonly schemaVersion: typeof MATCH_SNAPSHOT_SCHEMA_VERSION;
  readonly mode: GameMode;
  readonly authority: "local" | "server";
  readonly connection: ConnectionState;
  readonly lifecycle: MatchLifecycle;
  readonly terminationReason: MatchTerminationReason | null;
  readonly exitConfirmationOpen: boolean;
  readonly currentPlayer: PieceColor;
  readonly controller: MatchController;
  readonly board: readonly (readonly (MatchPieceSnapshot | null)[])[];
  readonly currentRoll: readonly [PieceType, PieceType, PieceType];
  readonly roll: MatchRollSnapshot;
  readonly skip: MatchSkipSnapshot;
  readonly capabilities: MatchCapabilities;
  readonly hasPlayableMoves: boolean;
  readonly remainingRights: Readonly<Record<PieceType, number>>;
  readonly selectableMoves: readonly Move[];
  readonly selectedSquare: Readonly<Position> | null;
  readonly clock: MatchClockSnapshot;
  readonly winner: PieceColor | null;
  readonly resultReason: GameResultReason | null;
  readonly moveHistory: readonly MatchTurnHistory[];
}

export type MatchAction =
  | { readonly schemaVersion: 1; readonly type: "SELECT_SQUARE"; readonly position: Readonly<Position> }
  | { readonly schemaVersion: 1; readonly type: "CLEAR_SELECTION" }
  | {
      readonly schemaVersion: 1;
      readonly type: "MAKE_MOVE";
      readonly pieceId: string;
      readonly from: Readonly<Position>;
      readonly to: Readonly<Position>;
    }
  | { readonly schemaVersion: 1; readonly type: "START_MANUAL_ROLL" }
  | { readonly schemaVersion: 1; readonly type: "OPEN_EXIT_CONFIRMATION" }
  | { readonly schemaVersion: 1; readonly type: "CANCEL_EXIT_CONFIRMATION" }
  | { readonly schemaVersion: 1; readonly type: "ABANDON_MATCH" };

export type MatchActionRejectionReason =
  | "illegal-move"
  | "invalid-action"
  | "not-active-player"
  | "roll-in-progress"
  | "roll-not-allowed"
  | "not-human-turn"
  | "game-over"
  | "session-disposed";

export type MatchActionResult =
  | { readonly accepted: true; readonly snapshot: MatchSnapshot }
  | {
      readonly accepted: false;
      readonly reason: MatchActionRejectionReason;
      readonly snapshot: MatchSnapshot;
    };

export type MatchListener = (snapshot: MatchSnapshot) => void;
export type Unsubscribe = () => void;

export interface MatchSession {
  getSnapshot(): MatchSnapshot;
  subscribe(listener: MatchListener): Unsubscribe;
  requestAction(action: MatchAction): Promise<MatchActionResult>;
  dispose(): void;
}
