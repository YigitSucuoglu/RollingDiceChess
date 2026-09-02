import {
  LeaderboardReadError,
  type CurrentPlayerRank,
  type LeaderboardState,
  type RankedLeaderboardEntry,
} from "./LeaderboardContracts";
import type { LeaderboardPort } from "./LeaderboardPort";

const INITIAL_STATE: LeaderboardState = {
  top: { status: "idle" },
  currentPlayer: { status: "idle" },
};

function normalizedError(error: unknown): LeaderboardReadError {
  return error instanceof LeaderboardReadError
    ? error
    : new LeaderboardReadError("unavailable");
}

export class LeaderboardService {
  private readonly port: LeaderboardPort;
  private state: LeaderboardState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  private requestVersion = 0;
  private inFlight?: Promise<void>;
  private revalidationInFlight?: Promise<void>;

  public constructor(port: LeaderboardPort) { this.port = port; }

  public getState(): LeaderboardState {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public load(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    return this.startRequest();
  }

  public revalidate(): Promise<void> {
    if (this.revalidationInFlight) return this.revalidationInFlight;
    const request = this.startRequest();
    this.revalidationInFlight = request;
    void request.finally(() => {
      if (this.revalidationInFlight === request) this.revalidationInFlight = undefined;
    });
    return request;
  }

  private startRequest(): Promise<void> {
    const version = ++this.requestVersion;
    this.setState({ top: { status: "loading" }, currentPlayer: { status: "loading" } });
    const request = Promise.allSettled([
      this.loadTop(version),
      this.loadCurrentPlayer(version),
    ]).then(() => undefined);
    this.inFlight = request;
    void request.finally(() => {
      if (this.inFlight === request) this.inFlight = undefined;
    });
    return request;
  }

  private async loadTop(version: number): Promise<void> {
    try {
      const entries = await this.port.fetchTop100();
      if (version !== this.requestVersion) return;
      this.setState({
        ...this.state,
        top: entries.length === 0 ? { status: "empty" } : { status: "success", entries },
      });
    } catch (error) {
      if (version !== this.requestVersion) return;
      this.setState({ ...this.state, top: { status: "error", error: normalizedError(error) } });
    }
  }

  private async loadCurrentPlayer(version: number): Promise<void> {
    try {
      const player = await this.port.fetchCurrentPlayerRank();
      if (version !== this.requestVersion) return;
      this.setState({
        ...this.state,
        currentPlayer: player.qualified && player.rank !== null
          ? { status: "qualified", player: player as CurrentPlayerRank & { qualified: true; rank: number } }
          : { status: "unqualified", player: player as CurrentPlayerRank & { qualified: false; rank: null } },
      });
    } catch (error) {
      if (version !== this.requestVersion) return;
      this.setState({
        ...this.state,
        currentPlayer: { status: "error", error: normalizedError(error) },
      });
    }
  }

  private setState(state: LeaderboardState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

export type { RankedLeaderboardEntry };
