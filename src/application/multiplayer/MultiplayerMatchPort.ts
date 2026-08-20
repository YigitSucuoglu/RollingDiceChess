import type { Position } from "../../types/Chess";
import type { AuthoritativeStoredState } from "./AuthoritativeMatchEngine";
import type { MultiplayerMode, MultiplayerParticipantPublicSummary, MultiplayerTerminationReason } from "../../domain/multiplayer/MultiplayerContracts";
import type { MatchTimeControl } from "../../domain/contracts/MatchContracts";
import type { PieceColor } from "../../types/Chess";

export interface MultiplayerServerSnapshot {
  readonly schemaVersion: 1;
  readonly matchId: string;
  readonly revision: number;
  readonly status: "initializing" | "active" | "terminal" | "technical-abort";
  readonly mode: MultiplayerMode;
  readonly ownSide: PieceColor | null;
  readonly white: MultiplayerParticipantPublicSummary | null;
  readonly black: MultiplayerParticipantPublicSummary | null;
  readonly timeControl: MatchTimeControl;
  readonly game: AuthoritativeStoredState | null;
  readonly clock: {
    readonly whiteRemainingMs: number | null;
    readonly blackRemainingMs: number | null;
    readonly activeTurnStartedAt: string | null;
    readonly serverNow: string;
  };
  readonly connections: {
    readonly whiteReconnectDeadline: string | null;
    readonly blackReconnectDeadline: string | null;
  };
  readonly winner: PieceColor | null;
  readonly terminationReason: MultiplayerTerminationReason | null;
}

export type MultiplayerMatchIntent =
  | { readonly action: "start"; readonly matchId: string }
  | { readonly action: "snapshot" | "heartbeat" | "forfeit"; readonly matchId: string }
  | {
      readonly action: "move";
      readonly matchId: string;
      readonly expectedRevision: number;
      readonly from: Readonly<Position>;
      readonly to: Readonly<Position>;
    }
  | {
      readonly action: "advance-unplayable";
      readonly matchId: string;
      readonly expectedRevision: number;
    };

export interface MultiplayerMatchPort {
  request(intent: MultiplayerMatchIntent): Promise<MultiplayerServerSnapshot>;
  subscribe(matchId: string, listener: () => void): () => void;
}
