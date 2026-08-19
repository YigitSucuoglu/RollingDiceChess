import type {
  CreateLobbyIntent,
  MultiplayerLobbySnapshot,
  MultiplayerParticipantPublicSummary,
  SidePreference,
} from "../../domain/multiplayer/MultiplayerContracts";
import type { PieceColor } from "../../types/Chess";

export type MultiplayerLobbyRole = "host" | "opponent";

export interface OpenMultiplayerLobby {
  readonly lobbyId: string;
  readonly host: MultiplayerParticipantPublicSummary;
  readonly mode: "ranked" | "unranked";
  readonly sidePreference: SidePreference;
  readonly timeControl: MultiplayerLobbySnapshot["timeControl"];
}

export type CurrentMultiplayerContext =
  | { readonly kind: "lobby"; readonly role: MultiplayerLobbyRole; readonly lobby: MultiplayerLobbySnapshot }
  | { readonly kind: "match"; readonly matchId: string };

export interface MultiplayerStartResult {
  readonly matchId: string;
  readonly status: "initializing" | "active";
  readonly ownSide: PieceColor | null;
  readonly revision: number;
}

export type MultiplayerInvalidation =
  | { readonly scope: "public-list"; readonly event: string }
  | { readonly scope: "participant"; readonly event: string; readonly lobbyId: string };

export type MultiplayerFailureCode =
  | "already-active"
  | "forbidden"
  | "invalid-code"
  | "lobby-full"
  | "lobby-unavailable"
  | "network"
  | "not-configured"
  | "unknown";

export class MultiplayerLobbyError extends Error {
  public readonly code: MultiplayerFailureCode;
  public constructor(code: MultiplayerFailureCode) {
    super(code);
    this.name = "MultiplayerLobbyError";
    this.code = code;
  }
}

export interface MultiplayerLobbyPort {
  isAvailable(): boolean;
  listOpenLobbies(): Promise<readonly OpenMultiplayerLobby[]>;
  getCurrentContext(): Promise<CurrentMultiplayerContext | null>;
  getLobby(lobbyId: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>>;
  createLobby(intent: CreateLobbyIntent): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>>;
  joinPublicLobby(lobbyId: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>>;
  joinPrivateLobby(code: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>>;
  kickOpponent(lobbyId: string): Promise<Extract<CurrentMultiplayerContext, { kind: "lobby" }>>;
  leaveLobby(lobbyId: string): Promise<void>;
  startMatch(lobbyId: string): Promise<MultiplayerStartResult>;
  subscribe(listener: (event: MultiplayerInvalidation) => void): () => void;
  dispose(): void;
}
