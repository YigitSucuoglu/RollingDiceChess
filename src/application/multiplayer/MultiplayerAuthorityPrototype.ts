import type { IdGenerator, RandomSource, TimeSource } from "../../domain/contracts/PlatformPorts";
import type { PlayerId } from "../../domain/contracts/PlayerIdentity";
import {
  MULTIPLAYER_CONTRACT_VERSION,
  PRIVATE_LOBBY_CODE_PATTERN,
  RECONNECT_GRACE_MS,
  type AuthoritativeMultiplayerMatchSnapshot,
  type AuthorizedMoveIntent,
  type CreateLobbyIntent,
  type FutureRatingSettlementIntent,
  type MultiplayerLobbySnapshot,
  type MultiplayerMoveIntent,
  type TrustedMultiplayerParticipant,
} from "../../domain/multiplayer/MultiplayerContracts";
import ChessBoard from "../../engine/ChessBoard";
import DiceEngine from "../../engine/DiceEngine";
import TurnRights from "../../engine/TurnRights";
import type { PieceColor } from "../../types/Chess";

const LOBBY_TTL_MS = 30 * 60_000;
const PRIVATE_CODE_ATTEMPT_LIMIT = 20;

interface StoredLobby {
  snapshot: MultiplayerLobbySnapshot;
  host: TrustedMultiplayerParticipant;
  opponent: TrustedMultiplayerParticipant | null;
  matchId: string | null;
}

interface StoredMatch {
  snapshot: AuthoritativeMultiplayerMatchSnapshot;
  whitePlayerId: PlayerId;
  blackPlayerId: PlayerId;
}

export class MultiplayerAuthorityError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "MultiplayerAuthorityError";
    this.code = code;
  }
}

export class MultiplayerAuthorityPrototype {
  private readonly random: RandomSource;

  private readonly time: TimeSource;

  private readonly ids: IdGenerator;

  private readonly lobbies = new Map<string, StoredLobby>();
  private readonly matches = new Map<string, StoredMatch>();
  private readonly activeMembership = new Map<PlayerId, string>();

  public constructor(
    random: RandomSource,
    time: TimeSource,
    ids: IdGenerator,
  ) {
    this.random = random;
    this.time = time;
    this.ids = ids;
  }

  public createLobby(host: TrustedMultiplayerParticipant, intent: CreateLobbyIntent): MultiplayerLobbySnapshot {
    this.assertPlayerAvailable(host.playerId);
    this.validateIntent(intent);
    const lobbyId = this.ids.nextId();
    const privateCode = intent.visibility === "private" ? this.allocatePrivateCode() : null;
    const snapshot: MultiplayerLobbySnapshot = {
      schemaVersion: MULTIPLAYER_CONTRACT_VERSION,
      lobbyId,
      status: "waiting",
      visibility: intent.visibility,
      mode: intent.mode,
      sidePreference: intent.mode === "ranked" ? "random" : intent.sidePreference,
      timeControl: { ...intent.timeControl },
      host: { ...host.publicSummary },
      opponent: null,
      privateCode,
      expiresAtMs: this.time.now() + LOBBY_TTL_MS,
    };
    this.lobbies.set(lobbyId, { snapshot, host, opponent: null, matchId: null });
    this.activeMembership.set(host.playerId, lobbyId);
    return this.copyLobby(snapshot);
  }

  public listPublicLobbies(): readonly MultiplayerLobbySnapshot[] {
    this.expireLobbies();
    return [...this.lobbies.values()]
      .filter(({ snapshot }) => snapshot.visibility === "public" && snapshot.status === "waiting")
      .map(({ snapshot }) => this.copyLobby(snapshot, false));
  }

  public joinPublicLobby(player: TrustedMultiplayerParticipant, lobbyId: string): MultiplayerLobbySnapshot {
    return this.join(player, this.requireLobby(lobbyId));
  }

  public joinPrivateLobby(player: TrustedMultiplayerParticipant, code: string): MultiplayerLobbySnapshot {
    if (!PRIVATE_LOBBY_CODE_PATTERN.test(code)) {
      throw new MultiplayerAuthorityError("lobby-unavailable", "Lobby is no longer available.");
    }
    const lobby = [...this.lobbies.values()].find((candidate) =>
      candidate.snapshot.visibility === "private" && candidate.snapshot.privateCode === code);
    if (!lobby) throw new MultiplayerAuthorityError("lobby-unavailable", "Lobby is no longer available.");
    return this.join(player, lobby);
  }

  public leaveLobby(caller: PlayerId, lobbyId: string): MultiplayerLobbySnapshot {
    const lobby = this.requireLobby(lobbyId);
    if (lobby.snapshot.status !== "waiting" && lobby.snapshot.status !== "ready") {
      throw new MultiplayerAuthorityError("invalid-state", "Lobby cannot be left now.");
    }
    if (caller === lobby.host.playerId) {
      this.activeMembership.delete(lobby.host.playerId);
      if (lobby.opponent) this.activeMembership.delete(lobby.opponent.playerId);
      lobby.snapshot = { ...lobby.snapshot, status: "closed" };
    } else if (caller === lobby.opponent?.playerId) {
      this.activeMembership.delete(caller);
      lobby.opponent = null;
      lobby.snapshot = { ...lobby.snapshot, status: "waiting", opponent: null };
    } else {
      throw new MultiplayerAuthorityError("not-participant", "Caller is not a lobby participant.");
    }
    return this.copyLobby(lobby.snapshot);
  }

  public kickOpponent(hostId: PlayerId, lobbyId: string): MultiplayerLobbySnapshot {
    const lobby = this.requireLobby(lobbyId);
    if (hostId !== lobby.host.playerId) {
      throw new MultiplayerAuthorityError("not-host", "Only the host may kick an opponent.");
    }
    if (lobby.snapshot.status !== "ready" || !lobby.opponent) {
      throw new MultiplayerAuthorityError("invalid-state", "Lobby is not ready.");
    }
    this.activeMembership.delete(lobby.opponent.playerId);
    lobby.opponent = null;
    lobby.snapshot = { ...lobby.snapshot, status: "waiting", opponent: null };
    return this.copyLobby(lobby.snapshot);
  }

  public startMatch(hostId: PlayerId, lobbyId: string): AuthoritativeMultiplayerMatchSnapshot {
    const lobby = this.requireLobby(lobbyId);
    if (hostId !== lobby.host.playerId) {
      throw new MultiplayerAuthorityError("not-host", "Only the host may start a match.");
    }
    if (lobby.matchId) return this.copyMatch(this.requireMatch(lobby.matchId).snapshot);
    if (lobby.snapshot.status !== "ready" || !lobby.opponent) {
      throw new MultiplayerAuthorityError("invalid-state", "Lobby is not ready.");
    }
    lobby.snapshot = { ...lobby.snapshot, status: "starting" };
    const matchId = this.ids.nextId();
    const hostSide = this.resolveHostSide(lobby.snapshot.mode, lobby.snapshot.sidePreference);
    const white = hostSide === "white" ? lobby.host : lobby.opponent;
    const black = hostSide === "black" ? lobby.host : lobby.opponent;
    const board = new ChessBoard({ nextId: () => this.ids.nextId() });
    const roll = new DiceEngine(this.random).roll();
    const turnRights = new TurnRights();
    for (const piece of roll) turnRights.set(piece, turnRights.get(piece) + 1);
    const rights = turnRights.getSnapshot();
    const now = this.time.now();
    const initialMs = lobby.snapshot.timeControl.initialMs;
    const snapshot: AuthoritativeMultiplayerMatchSnapshot = {
      schemaVersion: MULTIPLAYER_CONTRACT_VERSION,
      matchId,
      revision: 1,
      status: "active",
      mode: lobby.snapshot.mode,
      timeControl: { ...lobby.snapshot.timeControl },
      white: { ...white.publicSummary },
      black: { ...black.publicSummary },
      game: {
        board: board.squares.map((row) => row.map((piece) => piece
          ? { ...piece, initialPosition: { ...piece.initialPosition } }
          : null)),
        currentTurn: "white",
        currentRoll: [...roll],
        remainingRights: rights,
      },
      clock: {
        whiteRemainingMs: initialMs,
        blackRemainingMs: initialMs,
        activeColor: "white",
        turnStartedAtMs: now,
        incrementMs: lobby.snapshot.timeControl.incrementMs,
      },
      connections: {
        white: { state: "connected", reconnectDeadlineMs: null },
        black: { state: "connected", reconnectDeadlineMs: null },
      },
      winner: null,
      terminationReason: null,
    };
    lobby.matchId = matchId;
    lobby.snapshot = { ...lobby.snapshot, status: "closed" };
    this.activeMembership.set(white.playerId, matchId);
    this.activeMembership.set(black.playerId, matchId);
    this.matches.set(matchId, { snapshot, whitePlayerId: white.playerId, blackPlayerId: black.playerId });
    return this.copyMatch(snapshot);
  }

  public authorizeMove(caller: PlayerId, intent: MultiplayerMoveIntent): AuthorizedMoveIntent {
    const match = this.requireMatch(intent.matchId);
    if (match.snapshot.status !== "active") throw new MultiplayerAuthorityError("not-active", "Match is not active.");
    if (intent.expectedRevision !== match.snapshot.revision) {
      throw new MultiplayerAuthorityError("stale-revision", "Canonical match revision has changed.");
    }
    const callerSide = this.sideFor(match, caller);
    if (callerSide !== match.snapshot.game.currentTurn) {
      throw new MultiplayerAuthorityError("not-active-player", "It is not the caller's turn.");
    }
    this.assertPosition(intent.from);
    this.assertPosition(intent.to);
    return { matchId: intent.matchId, revision: intent.expectedRevision, callerSide, from: { ...intent.from }, to: { ...intent.to } };
  }

  public disconnect(caller: PlayerId, matchId: string): AuthoritativeMultiplayerMatchSnapshot {
    const match = this.requireMatch(matchId);
    const side = this.sideFor(match, caller);
    if (match.snapshot.status !== "active") throw new MultiplayerAuthorityError("not-active", "Match is not active.");
    match.snapshot = {
      ...match.snapshot,
      revision: match.snapshot.revision + 1,
      connections: {
        ...match.snapshot.connections,
        [side]: { state: "disconnected", reconnectDeadlineMs: this.time.now() + RECONNECT_GRACE_MS },
      },
    };
    return this.copyMatch(match.snapshot);
  }

  public reconnect(caller: PlayerId, matchId: string): AuthoritativeMultiplayerMatchSnapshot {
    const match = this.requireMatch(matchId);
    const side = this.sideFor(match, caller);
    const connection = match.snapshot.connections[side];
    if (match.snapshot.status !== "active" || connection.state !== "disconnected"
        || this.time.now() > connection.reconnectDeadlineMs) {
      throw new MultiplayerAuthorityError("reconnect-expired", "Reconnect grace has expired.");
    }
    match.snapshot = {
      ...match.snapshot,
      revision: match.snapshot.revision + 1,
      connections: {
        ...match.snapshot.connections,
        [side]: { state: "connected", reconnectDeadlineMs: null },
      },
    };
    return this.copyMatch(match.snapshot);
  }

  public adjudicateReconnectDeadlines(matchId: string): AuthoritativeMultiplayerMatchSnapshot {
    const match = this.requireMatch(matchId);
    if (match.snapshot.status !== "active") return this.copyMatch(match.snapshot);
    const expired = (["white", "black"] as const).filter((side) => {
      const connection = match.snapshot.connections[side];
      return connection.state === "disconnected" && this.time.now() >= connection.reconnectDeadlineMs;
    });
    if (expired.length === 0) return this.copyMatch(match.snapshot);
    if (expired.length === 2) {
      match.snapshot = { ...match.snapshot, revision: match.snapshot.revision + 1, status: "technical-abort", terminationReason: "technical-abort" };
    } else {
      const loser = expired[0];
      match.snapshot = { ...match.snapshot, revision: match.snapshot.revision + 1, status: "terminal", winner: loser === "white" ? "black" : "white", terminationReason: "forfeit" };
    }
    return this.copyMatch(match.snapshot);
  }

  public leaveActiveMatch(caller: PlayerId, matchId: string): AuthoritativeMultiplayerMatchSnapshot {
    const match = this.requireMatch(matchId);
    const loser = this.sideFor(match, caller);
    if (match.snapshot.status !== "active") throw new MultiplayerAuthorityError("not-active", "Match is not active.");
    match.snapshot = { ...match.snapshot, revision: match.snapshot.revision + 1, status: "terminal", winner: loser === "white" ? "black" : "white", terminationReason: "forfeit" };
    return this.copyMatch(match.snapshot);
  }

  public createFutureRatingSettlement(matchId: string): FutureRatingSettlementIntent {
    const match = this.requireMatch(matchId);
    const { snapshot } = match;
    if (snapshot.mode !== "ranked" || snapshot.status !== "terminal" || !snapshot.winner
        || (snapshot.terminationReason !== "forfeit" && snapshot.terminationReason !== "king-captured" && snapshot.terminationReason !== "timeout")) return null;
    const winner = snapshot.winner === "white" ? match.whitePlayerId : match.blackPlayerId;
    const loser = snapshot.winner === "white" ? match.blackPlayerId : match.whitePlayerId;
    return { matchId, winner, loser, terminationReason: snapshot.terminationReason === "forfeit" ? "forfeit" : "normal" };
  }

  public getMatchSnapshot(caller: PlayerId, matchId: string): AuthoritativeMultiplayerMatchSnapshot {
    const match = this.requireMatch(matchId);
    this.sideFor(match, caller);
    return this.copyMatch(match.snapshot);
  }

  private join(player: TrustedMultiplayerParticipant, lobby: StoredLobby): MultiplayerLobbySnapshot {
    this.expireLobbies();
    this.assertPlayerAvailable(player.playerId);
    if (player.playerId === lobby.host.playerId || lobby.snapshot.status !== "waiting" || lobby.opponent) {
      throw new MultiplayerAuthorityError("lobby-unavailable", "Lobby is no longer available.");
    }
    lobby.opponent = player;
    lobby.snapshot = { ...lobby.snapshot, status: "ready", opponent: { ...player.publicSummary } };
    this.activeMembership.set(player.playerId, lobby.snapshot.lobbyId);
    return this.copyLobby(lobby.snapshot);
  }

  private validateIntent(intent: CreateLobbyIntent): void {
    if (intent.mode === "ranked" && intent.sidePreference !== "random") {
      throw new MultiplayerAuthorityError("ranked-side-policy", "Ranked side assignment is random only.");
    }
    if (!intent.timeControl.id.trim() || !Number.isSafeInteger(intent.timeControl.initialMs)
        || intent.timeControl.initialMs <= 0 || !Number.isSafeInteger(intent.timeControl.incrementMs)
        || intent.timeControl.incrementMs < 0) {
      throw new MultiplayerAuthorityError("invalid-time-control", "Time control is invalid.");
    }
  }

  private allocatePrivateCode(): string {
    for (let attempt = 0; attempt < PRIVATE_CODE_ATTEMPT_LIMIT; attempt++) {
      const value = this.random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("Random source must return a value in [0, 1).");
      const code = Math.floor(value * 1_000_000).toString().padStart(6, "0");
      if (![...this.lobbies.values()].some((lobby) => lobby.snapshot.status !== "closed" && lobby.snapshot.privateCode === code)) return code;
    }
    throw new MultiplayerAuthorityError("code-exhausted", "A unique private lobby code could not be allocated.");
  }

  private resolveHostSide(mode: "ranked" | "unranked", preference: "white" | "black" | "random"): PieceColor {
    if (mode === "unranked" && preference !== "random") return preference;
    return this.random() < 0.5 ? "white" : "black";
  }

  private expireLobbies(): void {
    const now = this.time.now();
    for (const lobby of this.lobbies.values()) {
      if ((lobby.snapshot.status === "waiting" || lobby.snapshot.status === "ready") && lobby.snapshot.expiresAtMs <= now) {
        this.activeMembership.delete(lobby.host.playerId);
        if (lobby.opponent) this.activeMembership.delete(lobby.opponent.playerId);
        lobby.snapshot = { ...lobby.snapshot, status: "closed" };
      }
    }
  }

  private assertPlayerAvailable(playerId: PlayerId): void {
    if (this.activeMembership.has(playerId)) throw new MultiplayerAuthorityError("player-busy", "Player already has an active lobby or match.");
  }

  private requireLobby(lobbyId: string): StoredLobby {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new MultiplayerAuthorityError("lobby-unavailable", "Lobby is no longer available.");
    return lobby;
  }

  private requireMatch(matchId: string): StoredMatch {
    const match = this.matches.get(matchId);
    if (!match) throw new MultiplayerAuthorityError("match-unavailable", "Match is unavailable.");
    return match;
  }

  private sideFor(match: StoredMatch, playerId: PlayerId): PieceColor {
    if (playerId === match.whitePlayerId) return "white";
    if (playerId === match.blackPlayerId) return "black";
    throw new MultiplayerAuthorityError("not-participant", "Caller is not a match participant.");
  }

  private assertPosition(position: Readonly<{ row: number; col: number }>): void {
    if (!Number.isInteger(position.row) || !Number.isInteger(position.col)
        || position.row < 0 || position.row > 7 || position.col < 0 || position.col > 7) {
      throw new MultiplayerAuthorityError("invalid-position", "Move position is invalid.");
    }
  }

  private copyLobby(snapshot: MultiplayerLobbySnapshot, includeCode = true): MultiplayerLobbySnapshot {
    return { ...snapshot, timeControl: { ...snapshot.timeControl }, host: { ...snapshot.host }, opponent: snapshot.opponent ? { ...snapshot.opponent } : null, privateCode: includeCode ? snapshot.privateCode : null };
  }

  private copyMatch(snapshot: AuthoritativeMultiplayerMatchSnapshot): AuthoritativeMultiplayerMatchSnapshot {
    return structuredClone(snapshot);
  }
}
