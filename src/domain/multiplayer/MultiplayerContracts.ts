import type { MatchPieceSnapshot, MatchTimeControl } from "../contracts/MatchContracts";
import type { PlayerId } from "../contracts/PlayerIdentity";
import type { PieceColor, PieceType, Position } from "../../types/Chess";

export const MULTIPLAYER_CONTRACT_VERSION = 1;
export const PRIVATE_LOBBY_CODE_PATTERN = /^\d{6}$/u;
export const RECONNECT_GRACE_MS = 30_000;

export type MultiplayerMode = "ranked" | "unranked";
export type LobbyVisibility = "public" | "private";
export type LobbyStatus = "waiting" | "ready" | "starting" | "closed";
export type SidePreference = "white" | "black" | "random";
export type MultiplayerMatchStatus = "initializing" | "active" | "terminal" | "technical-abort";
export type MultiplayerTerminationReason = "king-captured" | "timeout" | "forfeit" | "technical-abort";

export interface MultiplayerParticipantPublicSummary {
  readonly displayName: string;
  readonly publicDiscriminator: string;
  readonly multiplayerRating: number;
}

export interface TrustedMultiplayerParticipant {
  readonly playerId: PlayerId;
  readonly publicSummary: MultiplayerParticipantPublicSummary;
}

export interface CreateLobbyIntent {
  readonly visibility: LobbyVisibility;
  readonly mode: MultiplayerMode;
  readonly sidePreference: SidePreference;
  readonly timeControl: MatchTimeControl;
}

export interface MultiplayerLobbySnapshot {
  readonly schemaVersion: typeof MULTIPLAYER_CONTRACT_VERSION;
  readonly lobbyId: string;
  readonly status: LobbyStatus;
  readonly visibility: LobbyVisibility;
  readonly mode: MultiplayerMode;
  readonly sidePreference: SidePreference;
  readonly timeControl: MatchTimeControl;
  readonly host: MultiplayerParticipantPublicSummary;
  readonly opponent: MultiplayerParticipantPublicSummary | null;
  readonly privateCode: string | null;
  readonly expiresAtMs: number;
}

export type MultiplayerConnectionState =
  | { readonly state: "connected"; readonly reconnectDeadlineMs: null }
  | { readonly state: "disconnected"; readonly reconnectDeadlineMs: number };

export interface AuthoritativeMultiplayerGameState {
  readonly board: readonly (readonly (MatchPieceSnapshot | null)[])[];
  readonly currentTurn: PieceColor;
  readonly currentRoll: readonly [PieceType, PieceType, PieceType];
  readonly remainingRights: Readonly<Record<PieceType, number>>;
}

export interface AuthoritativeMultiplayerMatchSnapshot {
  readonly schemaVersion: typeof MULTIPLAYER_CONTRACT_VERSION;
  readonly matchId: string;
  readonly revision: number;
  readonly status: MultiplayerMatchStatus;
  readonly mode: MultiplayerMode;
  readonly timeControl: MatchTimeControl;
  readonly white: MultiplayerParticipantPublicSummary;
  readonly black: MultiplayerParticipantPublicSummary;
  readonly game: AuthoritativeMultiplayerGameState;
  readonly clock: {
    readonly whiteRemainingMs: number;
    readonly blackRemainingMs: number;
    readonly activeColor: PieceColor | null;
    readonly turnStartedAtMs: number | null;
    readonly incrementMs: number;
  };
  readonly connections: Readonly<Record<PieceColor, MultiplayerConnectionState>>;
  readonly winner: PieceColor | null;
  readonly terminationReason: MultiplayerTerminationReason | null;
}

/** Minimal browser intent. Authority derives piece, side, roll, clocks and resulting state. */
export interface MultiplayerMoveIntent {
  readonly matchId: string;
  readonly expectedRevision: number;
  readonly from: Readonly<Position>;
  readonly to: Readonly<Position>;
}

export interface AuthorizedMoveIntent {
  readonly matchId: string;
  readonly revision: number;
  readonly callerSide: PieceColor;
  readonly from: Readonly<Position>;
  readonly to: Readonly<Position>;
}

export type FutureRatingSettlementIntent = {
  readonly matchId: string;
  readonly winner: PlayerId;
  readonly loser: PlayerId;
  readonly terminationReason: "normal" | "forfeit";
} | null;
